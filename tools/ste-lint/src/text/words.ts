/**
 * Closed word classes and short word lists for the grammar heuristics.
 *
 * These lists are general English grammar. They do not come from the
 * ASD-STE100 dictionary. The linter cannot tag parts of speech, so the
 * heuristics look at the words near a word to guess how the text uses it.
 */

const set = (words : string) : ReadonlySet<string> => new Set(words.trim().split(/\s+/));

export const DETERMINERS : ReadonlySet<string> = set(`
    a an the this that these those each every all any some no its their your our my his her
    another other either neither both many much more most few several such which whose what one
`);

export const SUBJECT_PRONOUNS : ReadonlySet<string> = set("i you we they he she it this that which who there");

export const OBJECT_PRONOUNS : ReadonlySet<string> = set("me you us them him her it itself themselves this these those");

/** Forms of "be", with the contractions that contain "is", "are" or "am". */
export const BE_FORMS : ReadonlySet<string> = set(`
    am is are was were be been being isn't aren't wasn't weren't it's that's there's here's what's who's
    he's she's they're we're you're i'm
`);

/** Words before a past participle that make a passive: forms of "be" and "get". */
export const PASSIVE_AUXILIARIES : ReadonlySet<string> = new Set([...BE_FORMS, "get", "gets", "got", "gotten", "getting"]);

export const HAVE_FORMS : ReadonlySet<string> = set("have has had having haven't hasn't hadn't");

export const DO_FORMS : ReadonlySet<string> = set("do does did don't doesn't didn't");

export const MODALS : ReadonlySet<string> = set(`
    can cannot could may might must shall should will would can't couldn't mustn't shouldn't won't wouldn't
`);

export const PREPOSITIONS : ReadonlySet<string> = set(`
    about above across after against along among around as at before behind below beneath beside between
    beyond by despite down during except for from in inside into like near of off on onto out outside over
    past per since through throughout to toward towards under until up upon via with within without
`);

export const CONJUNCTIONS : ReadonlySet<string> = set(`
    and or but nor so yet if when while because although though unless until whether that where once than
`);

/** Words that start a condition or purpose clause before the main clause. */
export const CLAUSE_STARTERS : ReadonlySet<string> = set(`
    if when whenever before after while until unless once to for in on at during because as since where
    with without by from although though
`);

/** Words that can come before the verb of an imperative sentence. */
export const LEADING_ADVERBS : ReadonlySet<string> = set(`
    then first next also finally optionally now please second third afterward afterwards alternatively
    instead always only just simply again manually carefully immediately
`);

/** Adverbs that can come between an auxiliary verb and a participle. */
export const MIDDLE_ADVERBS : ReadonlySet<string> = set(`
    not also always never only then still already often usually automatically immediately sometimes just
    all both each first again correctly currently directly fully later normally now once possibly
    probably quickly rarely really safely silently simply successfully typically
`);

/** Words that tell the reader that a clause is a condition, so a participle after "be" is a state. */
export const CONDITION_MARKERS : ReadonlySet<string> = set(`
    if when whenever until unless while after before once whether sure that because since
`);

export const PARTICLES : ReadonlySet<string> = set("up out down off back over away");

export const NUMBER_WORDS : ReadonlySet<string> = set(`
    zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen
    seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred hundreds
    thousand thousands million millions billion billions dozen dozens half twice
`);

/** Units of measurement. A number and its unit count as one word (STE Rule 8.6). */
export const UNITS : ReadonlySet<string> = set(`
    ns µs μs us ms s sec secs second seconds millisecond milliseconds microsecond microseconds nanosecond
    nanoseconds min mins minute minutes h hr hrs hour hours day days week weeks month months year years
    b byte bytes kb mb gb tb kib mib gib tib kilobyte kilobytes megabyte megabytes gigabyte gigabytes
    % percent px pixel pixels hz khz mhz ghz fps °c °f degree degrees kg g mm cm m km kilogram kilograms
    gram grams kilometer kilometers liter liters litre litres inch inches
`);

/**
 * Words that end in "-ing" but are usually not verb forms: nouns, adjectives,
 * prepositions, and base forms, for example "bring".
 */
export const NON_VERB_ING : ReadonlySet<string> = set(`
    thing things string strings ring rings spring springs king kings wing wings sing bring brings during
    something anything everything nothing morning mornings evening evenings ceiling ceilings sibling
    siblings duckling earring inkling offspring pudding sterling swing swings sling wring cling fling
    sting
    outstanding ongoing upcoming incoming outgoing missing remaining pending interesting confusing
    misleading surprising promising demanding challenging exciting annoying boring willing worrying
    overwhelming existing corresponding underlying trailing preceding notwithstanding
    timing padding heading spacing wording warning beginning opening
`);

/** Irregular past participles. A participle after "be" makes a passive. */
export const IRREGULAR_PARTICIPLES : ReadonlySet<string> = set(`
    arisen awoken begun bent bitten blown bound broken brought built bought caught chosen cut dealt done
    drawn driven eaten fallen fed felt fought found flown forbidden forgotten forgiven frozen gotten given
    gone grown hung heard hidden hit held hurt kept known laid led left lent let lost made meant met paid
    put quit read rebuilt reset rerun ridden rung risen run said seen sought sold sent set shaken shown
    shut sung sunk slept slid spoken spent spun split spread stood stolen stuck struck sworn swept taken
    taught torn told thought thrown undone understood unset upset withdrawn woken worn won wound written
    overridden rewritten overwritten bitten
`);

/** Words that end in "-ed" but are not past participles. */
export const NOT_PARTICIPLE_ED : ReadonlySet<string> = set(`
    need needed bed red shed feed seed speed bleed breed deed embed exceed proceed succeed indeed hundred
    kindred sacred naked wicked rugged ragged aged beloved learned
`);

/**
 * Common verbs in their base form. The imperative heuristic and the
 * missing-subject heuristic use this list. The project glossary adds
 * technical verbs to it.
 */
export const COMMON_VERBS : ReadonlySet<string> = set(`
    accept access activate add adjust allow apply assign attach avoid begin bind block break bring build
    calculate call cancel capture change check choose clean clear click clone close collect combine commit
    compare compile complete compute configure confirm connect consider contain continue control convert
    copy correct count cover create deactivate debug decide declare decrease define delay delete deliver
    depend deploy describe destroy detach detect determine disable disconnect discard dispatch display
    dispose do download drag drop emit enable end enforce enqueue ensure enter estimate examine exclude
    execute exit expand expect explain export expose extend extract fail fetch fill filter find finish fire
    fix flag flush follow force forward freeze generate get give go grant group handle hold ignore implement
    import include increase indicate initialize insert inspect install invoke keep kill launch leave let
    limit link list listen load lock log look make manage map mark match measure merge migrate mock modify
    monitor mount move name navigate need note notify observe obtain omit open operate override parse pass
    paste pause perform pick pin place point poll post prefer prepare press prevent print process produce
    provide publish pull push put queue read rebuild reboot receive record reduce refer refresh register
    reject release reload remember remove rename render repeat replace report request require reschedule
    reset resize resolve respond restart restore resume retry return reuse review revert rotate run sample
    save schedule scroll search select send serve set share show shut sign skip sleep sort specify split
    start stay step stop store submit subscribe substitute supply support swap switch sync take tap tell
    terminate test throttle throw tick toggle touch track transform trigger try turn type uncomment
    uninstall unlock unpin unregister unsubscribe update upgrade upload use validate verify view visit wait
    wake warn watch wrap write yield
    agree appear arrive ask become belong come differ exist happen help know occur overlap reach remain
    seem survive think want
`);

/**
 * Nouns that software text often uses before another noun. The noun-cluster
 * heuristic counts only these words, technical nouns, proper nouns,
 * abbreviations and code. Words that are frequently verbs are not in this
 * list, so the heuristic does not count a verb as a noun.
 */
export const COMMON_NOUNS : ReadonlySet<string> = set(`
    attribute browser buffer bucket byte cache callback channel chart clock collector column component config
    configuration console constructor container context counter dashboard data database delay dependency
    deployment device dialog directory document domain duration element endpoint entry environment error
    event exception exporter factory field file folder frame framework function gauge handler hardware
    header heap heartbeat histogram history host id identifier index input instance interface interval item
    key keyboard label latency layer layout length level library lifecycle line listener logger loop
    machine memory message meter method metric millisecond mode model module monitor mouse network node
    number object observer offset option origin output owner package page pair parameter parser path
    pattern payload percentile period permission phase pipeline platform plugin pointer policy pool port
    position pressure priority problem procedure processor profile program project promise property protocol
    provider proxy quantity query range rate ratio reader reason receiver recorder reference region registry
    renderer repository resolution resource response router runtime scheduler schema scope screen script
    second section selector sender sequence server service session setting signal size slot snapshot socket
    source span stack stage standard state statement status storage stream string structure style
    subscriber suite summary symbol syntax system tab table target task template terminal text thread
    threshold time timeout timer timestamp title token tool topic trace transaction transport tree tuple
    unit url usage user utility validator value variable vendor version viewport visibility warning window
    worker workspace wrapper
`);

/** Abbreviations after which a period does not end a sentence. */
export const NO_BREAK_ABBREVIATIONS : ReadonlySet<string> = set(`
    e.g i.e vs viz cf al approx mr mrs dr st jr sr inc ltd corp u.s a.m p.m
`);

/** Abbreviations that do not end a sentence when a number comes after them, for example "Fig. 3". */
export const NUMBER_ABBREVIATIONS : ReadonlySet<string> = set("fig figs eq eqs no nos ref vol ch pp p sec para");
