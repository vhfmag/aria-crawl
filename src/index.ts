import * as cheerio from "cheerio";
import * as cachedFetch from "make-fetch-happen";

// TODO: parse values

const htmlAriaUrl = "https://www.w3.org/TR/html-aria";
const waiAriaUrl = "https://www.w3.org/TR/wai-aria-1.1";

const fetch = cachedFetch.defaults({ cacheManager: "./.cache" });

type NotNullish<T> = T extends null | undefined ? never : T;

const isNotNullish = <T>(val: T): val is NotNullish<T> => !!val;

async function getAndCheerio(...args: Arguments<typeof fetch>) {
    return cheerio.load(await fetch(...args).then(res => res.text()));
}

function extractTextFromRegex(regex: RegExp, text: string): string | undefined {
    const regexArr = text.match(regex);
    return (regexArr && regexArr[1]) || undefined;
}

function propStateSelector(fn: (value: string) => string): string {
    return ["property", "state"].map(fn).join(", ");
}

const parsePropStateSection = (
    waiAria$: CheerioStatic,
    type: "property" | "state",
) => (propSection: CheerioElement) => {
    const propSection$ = cheerio.load(propSection);
    const id = propSection.attribs.id;
    const description =
        waiAria$(
            propStateSelector(
                propState =>
                    `#index_state_prop .${propState}-reference[href="#${id}"]`,
            ),
        )
            .closest("dt")
            .next("dd")
            .text()
            .trim() || null;
    const longDescription =
        propSection$(`#desc-${id}`)
            .text()
            .trim() || null;

    const featuresTable$ = propSection$(
        propStateSelector(propState => `.${propState}-features`),
    );
    const valueHref = featuresTable$
        .find(propStateSelector(propState => `.${propState}-value a`))
        .attr("href");

    const valueType = extractTextFromRegex(/#valuetype_(.+)/, valueHref);

    const applicableRoles = featuresTable$
        .find(
            propStateSelector(
                propState => `.${propState}-applicability a.role-reference`,
            ),
        )
        .toArray()
        .map(anchor => anchor.attribs.href.substr(1));

    const inheritsIntoRoles = featuresTable$
        .find(
            propStateSelector(
                propState => `.${propState}-descendants a.role-reference`,
            ),
        )
        .toArray()
        .map(anchor => anchor.attribs.href.substr(1));

    const relatedConcepts =
        featuresTable$
            .find(propStateSelector(propState => `.${propState}-related`))
            .text()
            .trim() || null;

    return {
        id,
        type,
        valueType,
        description,
        relatedConcepts,
        longDescription,
        applicableRoles,
        inheritsIntoRoles,
    };
};

async function crawlWaiAria() {
    const waiAria$ = await getAndCheerio(waiAriaUrl);

    const states = waiAria$("#state_prop_def section.state")
        .toArray()
        .map(parsePropStateSection(waiAria$, "state"));

    const properties = waiAria$("#state_prop_def section.property")
        .toArray()
        .map(parsePropStateSection(waiAria$, "property"));

    return {
        states,
        properties,
        values: await crawlValues(),
    };
}

async function crawlHtmlAria() {
    const htmlAria$ = await getAndCheerio(htmlAriaUrl);

    const roleRows = htmlAria$("table#aria-table")
        .find("tbody tr")
        .toArray();
    const roles = roleRows
        .map(row => {
            const row$ = cheerio.load(row);

            if (row$("tr#index-aria-global").length !== 0) {
                return undefined;
            }

            const [
                role$,
                description$,
                requiredProps$,
                supportedProps$,
                kindOfContent$,
                descendantRestrictions$,
            ] = row$("td").toArray();

            const id = cheerio
                .load(role$)("*")
                .first()
                .text()
                .split(/\s/)[0];
            const description = cheerio
                .load(description$)("*")
                .first()
                .text();
            const requiredPropsAndStates = cheerio
                .load(requiredProps$)("a")
                .toArray()
                .map(anchor =>
                    cheerio
                        .load(anchor)("*")
                        .first()
                        .text()
                        .split(/\s/),
                );
            const supportedPropsAndStates = cheerio
                .load(supportedProps$)("a")
                .toArray()
                .map(anchor =>
                    cheerio
                        .load(anchor)("*")
                        .first()
                        .text()
                        .split(/\s/),
                );

            const tupleListToProps = (
                tupleList: string[][],
                isState: boolean,
                isRequired: boolean,
            ) =>
                tupleList
                    .filter(
                        ([, ...rest]) =>
                            isState === rest.join(" ").includes("state"),
                    )
                    .map(([propId]) => ({ id: propId, isRequired }));

            const props = [
                ...tupleListToProps(requiredPropsAndStates, false, true),
                ...tupleListToProps(supportedPropsAndStates, false, false),
            ];
            const states = [
                ...tupleListToProps(requiredPropsAndStates, true, true),
                ...tupleListToProps(supportedPropsAndStates, true, false),
            ];

            return {
                id,
                description,
                props,
                states,
            };
        })
        .filter(isNotNullish);

    return {
        roles,
    };
}

async function crawlValues() {
    const waiAria$ = await getAndCheerio(waiAriaUrl);
    return waiAria$("#propcharacteristic_value dl > *")
        .toArray()
        .reduce(
            (arr, el) => {
                const el$ = cheerio
                    .load(el)("*")
                    .first();
                if (el.tagName === "dt") {
                    arr.push({
                        id: el.attribs.id,
                        name: el$.text().trim(),
                    });
                } else {
                    arr[arr.length - 1].description = el$.text();
                }

                return arr;
            },
            [] as Array<{ id: string; name: string; description?: string }>,
        );
}

export async function crawlAria() {
    const [htmlData, waiData] = await Promise.all([
        crawlHtmlAria(),
        crawlWaiAria(),
    ]);

    return {
        ...htmlData,
        ...waiData,
    };
}

crawlAria()
    .then(result => JSON.stringify(result, undefined, 4))
    .then(console.log)
    .catch(console.error);
