import { Link } from "react-router";
import { useSections } from "../app/SectionsContext";
import { SITE_NAME } from "../app/site";
import styles from "./Home.module.css";

const EXAMPLE = `import { AsyncLocalStorage } from "async-browser-context";

const requestId = new AsyncLocalStorage<string>();

button.addEventListener("click", () =>
    requestId.run(crypto.randomUUID(), async () => {
        const user = await load("/api/user");
        await save(user);
    }));

async function save(user : User) {
    await post("/api/save", user);
    // The same ID, after each await
    log(requestId.getStore());
}`;

/** The home page: what the library does, a short example, and the sections of the site. */
export function HomePage() {
    const sections = useSections().filter(section => section.card);
    return (
        <div className={styles.page}>
            <title>{`${SITE_NAME}: AsyncLocalStorage for browsers`}</title>
            <section className={styles.hero} aria-labelledby="home-title">
                <div className={styles.heroText}>
                    <h1 id="home-title" className={styles.title}>Keep a value through each await in the browser</h1>
                    <p className={styles.lead}>
                        <code>{SITE_NAME}</code> gives the <code>AsyncLocalStorage</code> class of Node.js and the TC39{" "}
                        <code>AsyncContext</code> API to browsers. Set a value one time, for example a request ID. Code
                        that starts later in the same operation gets that value: after <code>await</code>, in{" "}
                        <code>then</code> callbacks, in timers, in event listeners and in generators.
                    </p>
                    <p className={styles.lead}>
                        A native <code>await</code> does not tell JavaScript code when it continues. Thus, a Babel preset or a
                        Vite plugin of the library changes each async function into a generator. A small runtime sets the
                        context before each step of the generator.
                    </p>
                    <p className={styles.actions}>
                        <Link className="button" data-variant="primary" to="/docs/getting-started">Start with the guide</Link>
                        <Link className="button" to="/explore/timeline">Look at the context timeline</Link>
                    </p>
                </div>
                <aside className={`${styles.indicator} graph-paper`} aria-label="Example">
                    <pre className={styles.example}><code>{EXAMPLE}</code></pre>
                </aside>
            </section>

            <section className={styles.sections} aria-labelledby="sections-title">
                <h2 id="sections-title" className={styles.sectionsTitle}>What this site holds</h2>
                <ul className={styles.cards}>
                    {sections.map(section => {
                        const Detail = section.card?.Detail;
                        return (
                            <li key={section.id} className={styles.card}>
                                <h3 className={styles.cardTitle}><Link to={section.path}>{section.label}</Link></h3>
                                <p className={styles.cardText}>{section.card?.summary}</p>
                                {Detail ? <Detail /> : null}
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
}
