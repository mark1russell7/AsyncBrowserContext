/**
 * Babel Plugin: @async-context/transform
 *
 * Automatically injects context tracking into async functions WITHOUT changing
 * the code structure. Preserves async/await while making it context-aware.
 *
 * NEW STRATEGY:
 * 1. Capture context token at async function entry (__getAsyncContext)
 * 2. Wrap the original async function to register the returned Promise
 * 3. Restore context before each await using the token
 * 4. Use WeakMap-based isolation (no shared global state)
 */

module.exports = function({ types: t }) {
  return {
    name: 'async-context-transform',

    visitor: {
      // Transform for-await-of loops to handle hidden awaits in iterator protocol
      ForAwaitStatement(path) {
        // Skip if already processed
        if (path.node.__asyncContextProcessed) return;
        path.node.__asyncContextProcessed = true;

        const { left, right, body } = path.node;

        // Generate unique identifiers
        const iteratorId = path.scope.generateUidIdentifier('iterator');
        const resultId = path.scope.generateUidIdentifier('result');
        const doneId = path.scope.generateUidIdentifier('done');

        // Variable declaration for the loop variable
        let loopVarDeclaration;
        let loopVarId;

        if (t.isVariableDeclaration(left)) {
          // for await (const x of ...)
          loopVarId = left.declarations[0].id;
          // Always use 'let' for loop variable since we assign it in the loop
          loopVarDeclaration = t.variableDeclaration('let', [
            t.variableDeclarator(loopVarId)
          ]);
        } else {
          // for await (x of ...) - assignment pattern
          loopVarId = left;
        }

        // Use the parent async function's __asyncContext if it exists
        // The Function visitor runs first and creates __asyncContext
        // We can reuse that in our finally block
        const asyncFunctionParent = path.getFunctionParent();
        const contextVar = t.identifier('__asyncContext');

        // Context restore in finally
        const contextRestore = t.ifStatement(
          contextVar,
          t.expressionStatement(
            t.callExpression(t.identifier('__setAsyncContext'), [contextVar])
          )
        );

        // Build the transformed loop:
        // const __asyncContext = typeof __getAsyncContext === "function" ? __getAsyncContext() : undefined;
        // const iterator = right[Symbol.asyncIterator]();
        // let __done = false;
        // while (!__done) {
        //   let __result;
        //   try {
        //     __result = await iterator.next();
        //   } finally {
        //     if (__asyncContext) __setAsyncContext(__asyncContext);
        //   }
        //   __done = __result.done;
        //   if (!__done) {
        //     const/let value = __result.value;
        //     // original body
        //   }
        // }

        const replacement = [
          // const iterator = right[Symbol.asyncIterator]()
          t.variableDeclaration('const', [
            t.variableDeclarator(
              iteratorId,
              t.callExpression(
                t.memberExpression(
                  right,
                  t.memberExpression(
                    t.identifier('Symbol'),
                    t.identifier('asyncIterator')
                  ),
                  true
                ),
                []
              )
            )
          ]),

          // let __done = false
          t.variableDeclaration('let', [
            t.variableDeclarator(doneId, t.booleanLiteral(false))
          ]),

          // while (!__done) { ... }
          t.whileStatement(
            t.unaryExpression('!', doneId),
            t.blockStatement([
              // let __result
              t.variableDeclaration('let', [
                t.variableDeclarator(resultId)
              ]),

              // try { __result = await iterator.next() } finally { restore }
              t.tryStatement(
                t.blockStatement([
                  t.expressionStatement(
                    t.assignmentExpression(
                      '=',
                      resultId,
                      t.awaitExpression(
                        t.callExpression(
                          t.memberExpression(iteratorId, t.identifier('next')),
                          []
                        )
                      )
                    )
                  )
                ]),
                null,
                t.blockStatement([contextRestore])
              ),

              // __done = __result.done
              t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  doneId,
                  t.memberExpression(resultId, t.identifier('done'))
                )
              ),

              // if (!__done) { const value = __result.value; body }
              t.ifStatement(
                t.unaryExpression('!', doneId),
                t.blockStatement([
                  // Assign loop variable
                  ...(loopVarDeclaration ? [
                    t.expressionStatement(
                      t.assignmentExpression(
                        '=',
                        loopVarId,
                        t.memberExpression(resultId, t.identifier('value'))
                      )
                    )
                  ] : [
                    t.expressionStatement(
                      t.assignmentExpression('=', loopVarId, t.memberExpression(resultId, t.identifier('value')))
                    )
                  ]),

                  // Original body
                  ...(t.isBlockStatement(body) ? body.body : [body])
                ])
              )
            ])
          )
        ];

        // Add loop variable declaration if needed (before the while loop)
        if (loopVarDeclaration) {
          replacement.splice(2, 0, loopVarDeclaration);
        }

        path.replaceWithMultiple(replacement);
      },

      // Transform async functions
      Function(path) {
        // Only process async functions
        if (!path.node.async) return;

        // Skip if already processed
        if (path.node.__asyncContextProcessed) return;
        path.node.__asyncContextProcessed = true;

        const body = path.node.body;

        // Handle arrow functions with expression body
        if (t.isExpression(body)) {
          // Convert to block statement
          path.node.body = t.blockStatement([
            t.returnStatement(body)
          ]);
        }

        // Get function body statements
        const originalBodyStatements = [...path.node.body.body];

        // First, process awaits in the original body
        // Collect all await expressions
        const awaits = [];
        path.traverse({
          AwaitExpression(awaitPath) {
            // Only collect awaits in the current function (not nested functions)
            if (awaitPath.getFunctionParent() === path) {
              awaits.push(awaitPath);
            }
          }
        });

        // Process each await to wrap it in try/finally for guaranteed context restoration
        awaits.forEach(awaitPath => {
          if (awaitPath.node.__asyncContextProcessed) return;
          awaitPath.node.__asyncContextProcessed = true;

          // Find the statement containing this await
          const statementPath = awaitPath.findParent(p =>
            p.isStatement() && !p.isBlockStatement()
          );

          if (!statementPath) return;

          const statement = statementPath.node;

          // Context restore code that goes in finally
          const contextRestore = t.ifStatement(
            t.identifier('__asyncContext'),
            t.expressionStatement(
              t.callExpression(
                t.identifier('__setAsyncContext'),
                [t.identifier('__asyncContext')]
              )
            )
          );

          // Handle different statement types
          if (t.isVariableDeclaration(statement)) {
            // const x = await ... OR const {a, b} = await ...
            const declarations = statement.declarations;

            if (declarations.length === 1) {
              const declarator = declarations[0];
              const id = declarator.id;

              // Hoist variable declaration (convert const/let to let)
              let hoistedDeclaration;

              if (t.isIdentifier(id)) {
                // Simple: const x = await ...
                // Convert to: let x; try { x = await ... } finally { restore }
                hoistedDeclaration = t.variableDeclaration('let', [
                  t.variableDeclarator(id, null)
                ]);

                const assignment = t.expressionStatement(
                  t.assignmentExpression('=', t.identifier(id.name), declarator.init)
                );

                const tryFinally = t.tryStatement(
                  t.blockStatement([assignment]),
                  null,
                  t.blockStatement([contextRestore])
                );

                statementPath.replaceWithMultiple([hoistedDeclaration, tryFinally]);
              } else if (t.isObjectPattern(id) || t.isArrayPattern(id)) {
                // Destructuring: const {a, b} = await ... OR const [a, b] = await ...
                // Convert to: let a, b; try { const temp = await ...; a = temp.a; b = temp.b; } finally { restore }

                const tempVar = path.scope.generateUidIdentifier('temp');
                const hoistedVars = [];
                const assignments = [];

                if (t.isObjectPattern(id)) {
                  // Object destructuring - extract all identifiers recursively
                  const extractIdentifiers = (pattern) => {
                    const ids = [];
                    pattern.properties.forEach(prop => {
                      if (t.isObjectProperty(prop)) {
                        if (t.isIdentifier(prop.value)) {
                          ids.push(prop.value.name);
                        } else if (t.isPattern(prop.value)) {
                          // Nested pattern
                          ids.push(...extractIdentifiers(prop.value));
                        }
                      } else if (t.isRestElement(prop)) {
                        if (t.isIdentifier(prop.argument)) {
                          ids.push(prop.argument.name);
                        }
                      }
                    });
                    return ids;
                  };

                  const identifiers = extractIdentifiers(id);
                  identifiers.forEach(name => {
                    hoistedVars.push(t.variableDeclarator(t.identifier(name), null));
                  });

                  // Use full destructuring assignment
                  assignments.push(
                    t.expressionStatement(
                      t.assignmentExpression('=', id, tempVar)
                    )
                  );
                } else if (t.isArrayPattern(id)) {
                  // Array destructuring - extract all identifiers recursively
                  const extractIdentifiers = (pattern) => {
                    const ids = [];
                    pattern.elements.forEach(elem => {
                      if (t.isIdentifier(elem)) {
                        ids.push(elem.name);
                      } else if (t.isPattern(elem)) {
                        // Nested pattern
                        ids.push(...extractIdentifiers(elem));
                      } else if (t.isRestElement(elem)) {
                        if (t.isIdentifier(elem.argument)) {
                          ids.push(elem.argument.name);
                        }
                      }
                    });
                    return ids;
                  };

                  const identifiers = extractIdentifiers(id);
                  identifiers.forEach(name => {
                    hoistedVars.push(t.variableDeclarator(t.identifier(name), null));
                  });

                  // Use full destructuring assignment
                  assignments.push(
                    t.expressionStatement(
                      t.assignmentExpression('=', id, tempVar)
                    )
                  );
                }

                hoistedDeclaration = t.variableDeclaration('let', hoistedVars);

                const tempDeclaration = t.variableDeclaration('const', [
                  t.variableDeclarator(tempVar, declarator.init)
                ]);

                const tryFinally = t.tryStatement(
                  t.blockStatement([tempDeclaration, ...assignments]),
                  null,
                  t.blockStatement([contextRestore])
                );

                statementPath.replaceWithMultiple([hoistedDeclaration, tryFinally]);
              } else {
                // Fallback: wrap entire statement
                const tryFinally = t.tryStatement(
                  t.blockStatement([statement]),
                  null,
                  t.blockStatement([contextRestore])
                );
                statementPath.replaceWith(tryFinally);
              }
            } else {
              // Multiple declarations in one statement (rare with await)
              // Fallback: wrap entire statement
              const tryFinally = t.tryStatement(
                t.blockStatement([statement]),
                null,
                t.blockStatement([contextRestore])
              );
              statementPath.replaceWith(tryFinally);
            }
          } else {
            // Not a variable declaration (e.g., await x(); or return await x();)
            // Wrap the entire statement
            const tryFinally = t.tryStatement(
              t.blockStatement([statement]),
              null,
              t.blockStatement([contextRestore])
            );
            statementPath.replaceWith(tryFinally);
          }
        });

        // Re-get body statements after await processing
        const processedBodyStatements = [...path.node.body.body];

        // NEW APPROACH: Keep function async, just inject context capture at start
        // const __asyncContext = __getAsyncContext();
        const contextCapture = t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('__asyncContext'),
            t.conditionalExpression(
              t.binaryExpression(
                '===',
                t.unaryExpression('typeof', t.identifier('__getAsyncContext')),
                t.stringLiteral('function')
              ),
              t.callExpression(t.identifier('__getAsyncContext'), []),
              t.identifier('undefined')
            )
          )
        ]);

        // Inject at the start of the function
        path.node.body.body.unshift(contextCapture);

        // Function stays async!
        // The injected __setAsyncContext calls after each await will restore context
      }
    }
  };
};
