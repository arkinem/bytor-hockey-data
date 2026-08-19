import { spawn } from "node:child_process";

type Step = {
	name: string;
	command: string;
	args: string[];
};

const steps: Step[] = [
	{
		name: "Propose competitions",
		command: "pnpm",
		args: ["propose:england:gameday:competitions"],
	},
	{
		name: "Reconcile competitions",
		command: "pnpm",
		args: ["reconcile:england:gameday:competitions"],
	},
	{
		name: "Resolve teams",
		command: "pnpm",
		args: ["resolve:england:gameday:teams"],
	},
	{
		name: "Propose unresolved teams",
		command: "pnpm",
		args: ["propose:england:gameday:teams"],
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
	console.log("GameDay plan");
	console.log("============");

	for (const step of steps) {
		await runStep(step);
	}

	console.log("");
	console.log("GameDay plan complete.");
}

await main();
