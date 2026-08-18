const url = "https://websites.mygameday.app/comp_info.cgi?c=0-12997-0-652464-0&a=STATS";

async function main(): Promise<void> {
	const response = await fetch(url, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",

			Accept:
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

			"Accept-Language": "en-GB,en;q=0.9",

			Referer: "https://englandicehockey.com/juniors-leagues/",
		},
		redirect: "follow",
	});

	console.log(`HTTP ${response.status} ${response.statusText}`);

	console.log(`Final URL: ${response.url}`);

	const html = await response.text();

	console.log(`HTML length: ${html.length}`);

	console.log(`Contains U12 North 1: ${html.includes("U12 North 1")}`);

	console.log(`Contains table: ${html.includes("<table")}`);

	console.log("");

	console.log(html.slice(0, 500));
}

await main();
