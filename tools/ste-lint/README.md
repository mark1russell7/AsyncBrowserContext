# @lag/ste-lint

`ste-lint` examines the English prose of a project. It finds text that does not obey the writing rules of ASD-STE100 Simplified Technical English (STE), Issue 9. The project uses STE as its style for the README files, the documentation website and the TSDoc comments.

> [!NOTE]
> This tool is an automated approximation of the STE writing rules. It does not certify that a text obeys the standard. A text with no findings is not "STE compliant", and a person must examine the text too. This project is not affiliated with ASD, and ASD does not endorse this tool. "ASD-STE100" and "Simplified Technical English" are trademarks of ASD.

## Text that the tool examines

The tool reads these file types:

- **Markdown and MDX files.** The tool examines paragraphs, list items, block quotes, headings and table cells. It ignores front matter, fenced code, indented code, HTML blocks, JSX tags, MDX `import` and `export` lines, MDX expressions and link destinations.
- **TypeScript and JavaScript files.** The tool examines the doc comments (`/** ... */`). The TypeScript compiler parses each file, so comment syntax in a string or in a regular expression is not a comment. The tool ignores the names after `@param` and `@typeParam`, and it ignores `@example` sections. It examines the text of the other tags.
- **TSX and JSX files.** The tool also examines the text that the JSX shows. This text is the text of the elements, and the string values of some attributes, for example `title`, `aria-label` and `alt`. Inline elements, for example `strong` and `a`, stay in the text of their parent. A `code` element and a `{...}` expression each count as one word. The text of headings (`h1` to `h6`), of some short elements (for example `button` and `td`) and of the attributes is a fragment.

Each code span, `{@link ...}` tag, URL and quoted text counts as one word (STE Rule 8.6). The word rules do not examine the text in them. Thus, put code, file names, commands and quoted words in code font.

Headings and table cells are fragments. They get only the word rules, not the sentence rules or the paragraph rule.

## Rules

| ID | Default | STE rule | What the rule finds |
| --- | --- | --- | --- |
| `sentence-length` | error | 5.1, 6.3, 8.4 to 8.7 | An instruction with more than 20 words, or a descriptive sentence with more than 25 words. Text in parentheses counts as one word, and the tool examines it as a separate sentence. |
| `paragraph-length` | warning | 6.6 | A paragraph with more than 6 sentences. |
| `modal-verb` | error | 3.1, 3.4 | The modal verbs `should`, `may`, `might`, `would`, `shall`, `ought to`, `have to` and `need to`. |
| `semicolon` | error | 8.1 | A semicolon in prose. A semicolon in code is not prose. |
| `latin-abbreviation` | error | GR-6 | `e.g.`, `i.e.`, `etc.`, `vs.`, `viz.`, `cf.` and `et al.` |
| `about-quantity` | error | 1.3, 9.2 | The word `about` before a number or a quantity. Write "approximately". |
| `word-list` | per entry | 1.1, 9.1 | A word or a phrase of the project word list. The message gives the word to write. |
| `gendered-pronoun` | error | GR-7 | `he`, `she`, `his`, `her`, `him`, `hers`, `himself` and `herself`. |
| `first-person` | warning | GR-3 | `I`, `me`, `my`, `our` and `us`. The word "we" is correct for the organization that writes the text. |
| `passive-instruction` | warning | 3.6, 5.3 | The passive voice in an instruction, or an obligation in the passive voice (`must be set`). |
| `noun-cluster` | warning | 2.1 | More than 3 known nouns in sequence. |
| `missing-subject` | error | 4.2 | A doc comment sentence without a subject, for example `Returns the value.` |
| `ing-verb` | warning | 3.5 | An `-ing` form that the text uses as a verb. |
| `unknown-word` | warning | 1.1, 1.5, 1.12 | A word that is not in the local dictionary or the project glossary. This rule is active only with a dictionary. |

## Usage

Start the tool from the root of the repository:

```sh
pnpm lint:ste
pnpm lint:ste --format json
pnpm lint:ste --max-warnings 0 README.md "docs/**/*.md"
```

The options:

| Option | Function |
| --- | --- |
| `[patterns...]` | The glob patterns of the files to examine. Without patterns, the tool uses the `include` patterns of the configuration. |
| `--format text` | The default output: one group of findings for each file, a summary and the count of findings for each rule. |
| `--format json` | The findings and the summary as JSON. |
| `--max-warnings <n>` | Exit with code 1 when there are more than `n` warnings. |
| `--config <path>` | Use this configuration file. |
| `--help` | Show the help. |

The exit code is 0 when there are no errors, and not more warnings than the maximum. The exit code is 1 when there are errors or too many warnings. The exit code is 2 for an incorrect command line or configuration, or when no file matches the patterns.

The package also has the bin `ste-lint` (`dist/cli.js`) and a programmatic API. The `Linter` class examines text. The `runCli` function does the same work as the command line.

## Configuration

The tool reads `ste.config.json` in the working directory or in a parent directory. The patterns in the file are relative to the directory of the file. All properties are optional.

```json
{
  "include": ["README.md", "docs/**/*.{md,mdx}", "packages/*/src/**/*.{ts,tsx}"],
  "ignore": ["**/node_modules/**", "**/dist/**", "**/*.test.ts"],
  "technicalNouns": ["monitor", "heartbeat", "main thread"],
  "technicalVerbs": ["install", "flush"],
  "properNouns": ["OpenTelemetry", "Web Worker"],
  "allowedWords": [],
  "rules": { "noun-cluster": "off", "first-person": "error" },
  "wordList": [
    { "id": "via", "severity": "warning" },
    { "match": ["blazingly fast"], "suggest": "\"fast\"" },
    { "match": ["simply"], "severity": "off" }
  ],
  "limits": { "instructionWords": 20, "descriptionWords": 25, "paragraphSentences": 6, "nounClusterNouns": 3 },
  "dictionaryPath": null
}
```

| Property | Function |
| --- | --- |
| `include`, `ignore` | Glob patterns. The syntax has `*`, `**`, `?`, `{a,b}` and `[abc]`. A file name in `include` without glob characters is always examined. |
| `technicalNouns` | The nouns of the project glossary. A term can have more than one word. The noun-cluster rule counts a multi-word term as one noun. |
| `technicalVerbs` | The verbs of the project glossary, in the base form. The tool accepts all forms of each verb. |
| `properNouns` | Names of products, organizations and standards. A name with more than one word counts as one word. |
| `allowedWords` | Other words that the `ing-verb` rule and the `unknown-word` rule accept. |
| `rules` | The severity of each rule: `error`, `warning` or `off`. The setting of `word-list` replaces the severity of all its entries. |
| `wordList` | Entries that change the project word list. Refer to the next section. |
| `limits` | The numeric limits of the rules. |
| `dictionaryPath` | The path of a local dictionary file. Refer to the dictionary section. |

The file `ste.config.schema.json` in this package is a JSON schema for the configuration.

## The project word list

The word list is the style guide of the project. It has common plain-language substitutions, for example "use" for `utilize`, "start" for `initiate` and "before" for `prior to`. The list is in `src/word-list.ts`, and it is not a copy of the ASD-STE100 dictionary.

Each entry has these properties:

- `match`: the words or phrases to find. The match ignores case. The longest phrase wins.
- `suggest`: the words to write instead, as the message shows them. Without `suggest`, the message tells the reader to remove the word.
- `note`: more help for the message.
- `severity`: `error`, `warning` or `off`.
- `verbOnly`: true for a word that can also be a noun, for example `run` and `call`. Then the rule finds the word only where the words near it show a verb.

A configuration entry with the `id` of a default entry changes that entry. The ID of a default entry is its first word, for example `utilize` or `via`. A new entry gets the first word of `match` as its ID. An entry with the severity `off` removes the entry with that ID, and it removes its `match` words from all entries. A word of the glossary (`technicalNouns`, `technicalVerbs`, `properNouns` or `allowedWords`) does not get a word list finding.

## The local dictionary

The ASD-STE100 dictionary is copyrighted. This package does not contain it, and the repository must not contain it. To use the `unknown-word` rule, make a local file from your own copy of the standard. Keep the file outside the repository, or in the folder `.ste/`, which git ignores.

Give the path of the file in one of these two ways. The environment variable has priority.

- Set the environment variable `STE_DICTIONARY`. A relative path starts at the working directory.
- Set `dictionaryPath` in `ste.config.json`. A relative path starts at the directory of the configuration file.

A path can start with `~/` for the home directory. If the file does not exist, the tool writes a message and continues without the `unknown-word` rule.

The file contains JSON. The short form is an array of approved words, with all their forms:

```json
["a", "about", "make", "makes", "made", "valve", "valves"]
```

The full form has entries:

```json
{
  "format": "ste-lint-dictionary",
  "version": 1,
  "entries": [
    { "word": "make", "pos": "verb", "forms": ["makes", "made"] },
    { "word": "valve", "pos": "noun" },
    { "word": "utilize", "pos": "verb", "approved": false, "alternatives": ["use"] }
  ]
}
```

- `word` is necessary. A phrase approves each of its words.
- `pos` is the part of speech. A noun also permits its regular plural. Each verb form must be in `forms`.
- `approved` is `false` for a word that is not approved. The message then gives the `alternatives`.
- The nouns of the dictionary help the noun-cluster rule. The verbs of the dictionary help the instruction heuristic and the missing-subject heuristic.

## Suppression comments

A comment can stop the findings for some text. Give the rule IDs, or no IDs for all rules. Text after ` -- ` is a reason, and the tool ignores it.

- In Markdown, write `<!-- ste-disable-next modal-verb -- quoted text -->`. This comment stops the findings in the next block: a paragraph, a heading, a list item or a table row.
- `<!-- ste-disable -->` and `<!-- ste-enable -->` stop the findings in the text between them. In MDX, write `{/* ste-disable */}`.
- In TypeScript, write `// ste-disable-next` on the line before a doc comment. `// ste-disable` and `// ste-enable` make a range.

## How the heuristics operate

The tool has no part-of-speech tagger. Each heuristic looks at the words near a word. When a heuristic is not sure, it does not report a finding.

- **Instructions.** A sentence is an instruction when its first word is the base form of a known verb. "Do not", "Never" and "Make sure" also start an instruction. The tool first skips adverbs at the start, for example "then" and "please". It also skips a condition clause up to its comma ("If the tests fail, ..."). The next words must not show a noun subject ("Test runs take 5 s").

  The known verbs are a built-in list, the technical verbs and the verbs of the dictionary.
- **Passive voice.** A passive is a form of "be" or "get" and a past participle. In an instruction or in an ordered list, the rule reports each passive. In a condition ("if the file is deleted", "make sure that the server is started"), the participle shows a state, and the rule ignores it.
- **Missing subject.** The rule examines the summary and the `@remarks` text of doc comments. It finds a sentence that starts with one of these words:
  - A verb that ends in `-s`, for example "Returns" or "Creates"
  - An auxiliary verb, for example "Can" in "Can be null."
  - A participle, for example "Called" in "Called when ...".

  A plural noun at the start ("Samples at this value wait ...") is not a verb.
- **Noun clusters.** The rule counts only known nouns: glossary terms, dictionary nouns, a built-in list of common software nouns, abbreviations and code. A word that is frequently a verb does not count.
- **`-ing` verbs.** The rule finds an `-ing` word in these positions:
  - After a form of "be" ("is running")
  - After a preposition, with an object ("by closing the tab")
  - At the start of a clause, with an object
  - After a noun, with an object.

  A noun ("the timing") or an adjective ("existing code") is not a verb.

## Known limits

- The tool cannot know the meaning of a word. It does not find most errors of STE Rules 1.3 and 9.2, for example "release" for a new version, or "listen" for a server port. Only these words have context tests: "about" with a number, "see" for a reference, and some verbs of the word list.
- The heuristics miss some problems and report some false problems. For example, the noun-cluster rule does not count a word that is not on its lists. The `-ing` rule cannot always tell a gerund from a noun.
- A sentence can have a capital letter after an abbreviation or an initial. Then the sentence division can be incorrect.
- The Markdown parser knows only the structure that the rules need. It is not a full CommonMark parser.
- The tool examines only the rules in the table. It does not examine all 53 rules of the standard.
