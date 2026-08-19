import { spawn } from "node:child_process";

type Step = {
	name: string;
	command: string;
	args: string[];
};

const steps: Step[] = [
	{
		name: "Import competitions",
		command: "pnpm",
		args: ["import:england:gameday:competitions"],
	},
	{
		name: "Import teams",
		command: "pnpm",
		args: ["import:england:gameday:teams"],
	},
	{
		name: "Import participations",
		command: "pnpm",
		args: ["import:england:gameday:participations"],
	},
	{
		name: "Validate canonical data",
		command: "pnpm",
		args: ["validate"],
	},
	{
		name: "Run data audit",
		command: "pnpm",
		args: ["data-audit"],
	},
	{
		name: "Run GameDay provider audit",
		command: "pnpm",
		args: ["audit:england:gameday"],
	},
];

function runStep(step: Step): Promise<void> {
	return new Promise((resolve, reject) => {
		console.log("");
		console.log(`=== ${step.name} ===`);
		console.log("");

		const child = spawn(step.command, step.args, {
			stdio: "inherit",

			shell: process.platform === "win32",
		});

		child.on("error", (error) => {
			reject(error);
		});

		child.on("exit", (code) => {
			if (code === 0) {
				resolve();

				return;
			}

			reject(new Error(`${step.name} failed with exit code ${code ?? "unknown"}.`));
		});
	});
}

async function main(): Promise<void> {
	console.log("GameDay import");
	console.log("==============");

	for (const step of steps) {
		await runStep(step);
	}

	console.log("");
	console.log("GameDay import complete.");
}

await main();
