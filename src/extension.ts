// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import * as os from 'os';
import * as downloader from "@microsoft/vscode-file-downloader-api";

type ManifestDownloadEntry = {
	name: string;
	url: string;
	md5: string;
	suffix?: string;
	filename: string;
};

type ManifestEntry = {
	arch: string;
	downloads: ManifestDownloadEntry[];
};

type Manifest = {
	win32: ManifestEntry[];
	darwin: ManifestEntry[];
	linux: ManifestEntry[];
};

// Manifest data
const manifest: Manifest = require("../manifest/manifest.json");

// Ignore list
let ignore = [".git", ".vscode", "build"];

// Important directories
let homedir = os.homedir();
let toolsdir = vscode.Uri.joinPath(vscode.Uri.parse(homedir), ".zephyrtools");

// Boards 
let boards: string[] = [
	"circuitdojo_feather_nrf9160_ns",
	"sparkfun_thing_plus_nrf9160_ns",
	"particle_xenon"
];

// Config for the exention
interface Config {
	board?: string;
	project?: string;
	comport?: string;
	env?: { [name: string]: string | undefined };
}

// Platform
let platform: NodeJS.Platform;

// Arch
let arch: string;

// Output Channel
let output: vscode.OutputChannel

// Terminal
let terminal: vscode.Terminal;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	// Get the OS info
	platform = os.platform();
	arch = os.arch();

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	context.subscriptions.push(vscode.commands.registerCommand('zephyr-tools.setup', async () => {


		// Show setup progress..
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Setting up Zephyr dependencies",
			cancellable: true
		}, async (progress, token) => {

			token.onCancellationRequested(() => {
				console.log("User canceled the long running operation");
			});

			// Create & clear output
			if (output == undefined) {
				output = vscode.window.createOutputChannel("Zephyr SDK");
			}

			// Clear output before beginning
			output.clear();

			// Local config 
			let config: Config = {};
			config.env = process.env;

			// check if directory in $HOME exists
			await vscode.workspace.fs.stat(toolsdir).then(
				(value: vscode.FileStat) => {
					console.log("toolsdir found")
				},
				async (reason: any) => {
					// Otherwise create home directory
					await vscode.workspace.fs.createDirectory(toolsdir);
				});

			progress.report({ increment: 1 });

			// Promisified exec
			let exec = util.promisify(cp.exec);

			console.log("env" + JSON.stringify(config.env));

			// Check if Git exists in path
			let res: boolean = await exec("git --version", { env: config.env }).then(value => {
				output.append(value.stdout);
				output.append(value.stderr);
				output.appendLine("[SETUP] git installed");
				output.show();
				return true;
			}, (reason) => {
				output.appendLine("[SETUP] git is not found");
				output.append(reason);
				// TODO: install git instructions 
				output.show();

				// Error message
				vscode.window.showErrorMessage('Unable to continue. Git not installed. Check output for more info.');
				return false;
			});

			// Return if error
			if (!res) {
				return;
			}


			// Download python if platform is windows
			if (platform == "win32") {
				// TODO: download standalone version of python 
				// TODO: add to path to env
			} else {

				// Otherwise, check Python install
				res = await exec("python3 --version", { env: config.env }).then(value => {

					if (value.stdout.includes("Python 3")) {
						output.appendLine("[SETUP] python3 found");
					} else {
						output.appendLine("[SETUP] python3 not found");
						output.appendLine("[SETUP] you can install python by doing X");

						// TODO: specific download links or instructions depending on platform

						vscode.window.showErrorMessage('Error finding python. Check output for more info.');
						return false;
					}

					output.show();
					return true;
				}, (reason) => {
					output.append(reason.stderr);
					console.error(reason);
					output.show();

					// Error message
					vscode.window.showErrorMessage('Error getting python. Check output for more info.');
					return false;
				});

				// Return if error
				if (!res) {
					return;
				}

			}

			progress.report({ increment: 2 });

			// install pip (if not already)
			res = await exec("python3 -m ensurepip", { env: config.env }).then(value => {
				output.append(value.stdout);
				output.append(value.stderr);
				output.appendLine("[SETUP] pip installed");
				output.show();

				return true;
			}, (reason) => {
				output.appendLine("[SETUP] unable to install pip");
				output.append(reason);
				output.show();

				// Error message
				vscode.window.showErrorMessage('Error installing pip. Check output for more info.');

				return false;
			});

			// Return if error
			if (!res) {
				return;
			}

			progress.report({ increment: 3 });

			// install virtualenv
			res = await exec("python3 -m pip install --user virtualenv", { env: config.env }).then(value => {
				output.append(value.stdout);
				output.append(value.stderr);
				output.appendLine("[SETUP] virtualenv installed");
				output.show();
				return true;
			}, (reason) => {
				output.appendLine("[SETUP] unable to install virtualenv");
				output.append(reason);
				output.show();

				// Error message
				vscode.window.showErrorMessage('Error installing virtualenv. Check output for more info.');
				return false;
			});

			// Return if error
			if (!res) {
				return;
			}

			progress.report({ increment: 4 });

			// create virtualenv within `$HOME/.zephyrtools`
			let uri = vscode.Uri.joinPath(toolsdir, "env");

			console.log("path: " + uri.fsPath);

			res = await exec(`python3 -m virtualenv ${uri.fsPath}`, { env: config.env }).then(value => {
				output.append(value.stdout);
				output.append(value.stderr);
				output.appendLine("[SETUP] virtual python environment created");
				output.show();
				return true;
			}, (reason) => {
				output.appendLine("[SETUP] unable to setup virtualenv");
				output.append(reason);
				output.show();

				// Error message
				vscode.window.showErrorMessage('Error installing virtualenv. Check output for more info.');
				return false;
			});

			// Return if error
			if (!res) {
				return;
			}

			// Add env/bin to path
			const envpath = vscode.Uri.joinPath(uri, "bin:" + config.env["PATH"]);
			config.env["PATH"] = envpath.fsPath;

			console.log(config.env["PATH"]);

			progress.report({ increment: 5 });

			// Downloader
			const fileDownloader: downloader.FileDownloader = await downloader.getApi();

			for (const [key, value] of Object.entries(manifest)) {
				if (platform == key) {
					// For loop to process entry in manifest.json
					inner: for (const [index, element] of value.entries()) {
						// Confirm it's the correct architecture 
						if (element.arch == arch) {
							for (var download of element.downloads) {

								console.log(download.url);

								// TODO: EXTRA CREDIT -- check if already exists & hash 

								// Check if we can unzip..
								const shouldUnzip = download.url.includes(".zip");

								// Check if it already exists
								let filepath = await fileDownloader.getItem(download.filename, context).then((value) => value, (reason) => null);

								// Download if doesn't exist
								if (filepath == null) {
									output.appendLine("[SETUP] downloading " + download.url);
									output.show();

									filepath = await fileDownloader.downloadFile(
										vscode.Uri.parse(download.url),
										download.filename,
										context,
									/* cancellationToken */ undefined,
									/* progressCallback */ undefined,
										{ shouldUnzip: shouldUnzip }
									);
								}

								// TODO: EXTRA CREDIT - check MD5

								console.log(filepath.fsPath);

								// Get the path to copy the contents to..
								const copytopath = vscode.Uri.joinPath(toolsdir, download.name);

								// Unpack and place into `$HOME/.zephyrtools`
								if (shouldUnzip) {
									await vscode.workspace.fs.copy(filepath, copytopath, { overwrite: true });
								} else if (download.url.includes("tar")) {

									// Create copy to folder
									await vscode.workspace.fs.stat(copytopath).then(
										(value: vscode.FileStat) => {
											console.log("copytopath found")
										},
										async (reason: any) => {
											// Otherwise create home directory
											await vscode.workspace.fs.createDirectory(copytopath);
										});


									// Then untar
									const cmd = `tar -xvf "${filepath.fsPath}" -C "${copytopath.fsPath}"`;

									output.appendLine("[SETUP] extracting " + filepath.fsPath);
									output.show();

									res = await exec(cmd, { env: config.env }).then(value => {
										output.append(value.stdout);
										output.append(value.stderr);
										output.show();
										return true;
									}, (reason) => {
										output.append(reason);
										output.show();

										// Error message
										vscode.window.showErrorMessage('Error un-tar of download. Check output for more info.');

										return false;
									});

									// Return if untar was unsuccessful
									if (!res) {
										return;
									}

								}

								// Set path
								let setpath = copytopath;

								// Executables to path
								if (download.suffix) {
									setpath = vscode.Uri.joinPath(setpath, download.suffix);
								}

								const envpath = vscode.Uri.joinPath(setpath, ":" + config.env["PATH"]);
								config.env["PATH"] = envpath.fsPath;

								console.log(config.env);

							};

							break inner;
						} else {

							// Check if we're at the end of arch check
							if (index == (value.length - 1)) {
								vscode.window.showErrorMessage('Unsupported architecture for Zephyr Tools!');
							}
						}
					}

					progress.report({ increment: 50 });

					// Install `west`
					res = await exec(`python3 -m pip install west`, { env: config.env }).then(value => {
						output.append(value.stdout);
						output.append(value.stderr);
						output.appendLine("[SETUP] west installed");
						output.show();
						return true;
					}, (reason) => {
						output.appendLine("[SETUP] unable to install west");
						output.append(reason);
						output.show();

						// Error message
						vscode.window.showErrorMessage('Error installing west. Check output for more info.');
						return false;
					});

					// Return if error
					if (!res) {
						return;
					}

					progress.report({ increment: 75 });

					// TODO: Set the various environment variables 
					// config.env["GIT_EXEC_PATH"] = `${paths[platform]}/toolchain/Cellar/git/${gitversion}/libexec/git-core`
					config.env["ZEPHYR_TOOLCHAIN_VARIANT"] = `gnuarmemb`;
					// TODO: fix this to be platform agnostic
					config.env["GNUARMEMB_TOOLCHAIN_PATH"] = vscode.Uri.joinPath(toolsdir, 'toolchain/gcc-arm-none-eabi-9-2019-q4-major').fsPath;

					console.log("env: " + JSON.stringify(config));

					// Break from loop since we found the correct platform
					break;

				} else {

					// Check if this is the last iteration 
					let platforms = Object.keys(manifest);
					let last = platforms[platforms.length - 1];

					if (last == key) {
						vscode.window.showErrorMessage('Unsupported platform for Zephyr Tools!');
					}
				}
			}

			output.appendLine("[SETUP] Zephyr setup complete!");
			output.show();

			// Save this informaiton to disk
			context.workspaceState.update("config", config);

			progress.report({ increment: 100 });

			vscode.window.showInformationMessage(`Zephyr Tools setup complete!`)
		});




	}));

	context.subscriptions.push(vscode.commands.registerCommand('zephyr-tools.init-repo', async () => {

		// Fetch the board and NCS version
		let config: Config = context.workspaceState.get("config") ?? {};
		if (config == {} || config.env == undefined) {
			vscode.window.showErrorMessage('Run `Zephyr Tools: Setup` command before building.');
			return;
		}


		try {

			// Options for SehllExecution
			let options: vscode.ShellExecutionOptions = {
				executable: "bash",
				shellArgs: ["-c"],
				env: <{ [key: string]: string; }>config.env
			}

			// Tasks
			let taskName = "Zephyr Tools: Init Repo";
			let tasks: vscode.Task[] = [];

			// TODO: prompt for URL to init..
			// TODO: depending on input either init local or init remote	

			// TODO: if remote, prompt for place to init to (or a reasonable default?)

			// TODO 6. Init repository with `west init -m`

			// `west update`
			let cmd = `west update`;
			let shellexec = new vscode.ShellExecution(cmd, options);
			let task = new vscode.Task(
				{ type: "zephyr-tools", command: taskName },
				vscode.TaskScope.Workspace,
				taskName,
				"zephyr-tools",
				shellexec
			);
			tasks.push(task);

			// Install python dependencies `pip install -r zephyr/requirements.txt`
			cmd = "pip install -r zephyr/scripts/requirements.txt";
			shellexec = new vscode.ShellExecution(cmd, options);
			task = new vscode.Task(
				{ type: "zephyr-tools", command: taskName },
				vscode.TaskScope.Workspace,
				taskName,
				"zephyr-tools",
				shellexec
			);
			tasks.push(task);

			// Iterate over each task
			// TODO: one at a time..
			for (let task of tasks) {
				const execution = await vscode.tasks.executeTask(task);
				await vscode.tasks.onDidEndTask(e => {
					if (e.execution == execution) {
						console.log("done!");
					}
				})
			}

			// Select the project
			await changeProject(config, context);

			// TODO: open workspace in existing window (?)

		} catch (error) {

			let text = "";
			if (typeof error === "string") {
				text = error;
			} else if (error instanceof Error) {
				text = error.message
			}

			output.append(text);
			output.show();
			vscode.window.showErrorMessage(`Zephyr Tools: Init Repo error. See output for details.`);

		}

	}));

	context.subscriptions.push(vscode.commands.registerCommand('zephyr-tools.change-project', async () => {

		// Fetch the board and NCS version
		let config: Config = context.workspaceState.get("config") ?? {};

		if (config != {}) {
			changeProject(config, context);
		} else {
			// Display an error message box to the user
			vscode.window.showErrorMessage('Run `Zephyr Toools: Setup` command before building.');
		}


	}));

	context.subscriptions.push(vscode.commands.registerCommand('zephyr-tools.change-board', async () => {


		// Fetch the board and NCS version
		let config: Config = context.workspaceState.get("config") ?? {};

		if (config != {}) {
			changeBoard(config, context);
		} else {
			// Display an error message box to the user
			vscode.window.showErrorMessage('Run `Zephyr Toools: Setup` command before building.');
		}

	}));

	context.subscriptions.push(vscode.commands.registerCommand('zephyr-tools.select-com-port', async () => {
		// TODO: scan for available ports
		// TODO: show list and selection dialogue 
		// TODO: save to configuration
		console.log("TODO")
	}));

	// Does a pristine zephyr build
	context.subscriptions.push(vscode.commands.registerCommand('zephyr-tools.build-pristine', async () => {

		// Fetch the board and NCS version
		let config: Config = context.workspaceState.get("config") ?? {};

		// Do some work
		if (config != {} || config.env != undefined || config.project != undefined) {
			await build(config, true, context);
		} else if (config.project == undefined) {
			vscode.window.showErrorMessage('Run `Zephyr Tools: Init Project` command before building.');
		} else {
			// Display an error message box to the user
			vscode.window.showErrorMessage('Run `Zephyr Tools: Setup` command before building.');
		}


	}));

	// Utilizes build cache (if it exists) and builds
	context.subscriptions.push(vscode.commands.registerCommand('zephyr-tools.build', async () => {

		// Fetch the board and NCS version
		let config: Config = context.workspaceState.get("config") ?? {};

		// Do some work
		if (config != {} || config.env != undefined || config.project != undefined) {
			await build(config, false, context);
		} else if (config.project == undefined) {
			vscode.window.showErrorMessage('Run `Zephyr Tools: Init Project` command before building.');
		} else {
			vscode.window.showErrorMessage('Run `Zephyr Tools: Setup` command before building.');
		}


	}));

	// Flashes Zephyr project to board
	context.subscriptions.push(vscode.commands.registerCommand('zephyr-tools.flash', async () => {
		// Fetch the board and NCS version
		let config: Config = context.workspaceState.get("config") ?? {};

		// Flash board
		if (config != {}) {
			await flash(config);
		} else {
			// Display an error message box to the user
			vscode.window.showErrorMessage('Run `Zephyr Toools: Setup` command before flashing.');
		}
	}));


	// Cleans the project by removing the `build` folder
	context.subscriptions.push(vscode.commands.registerCommand('zephyr-tools.clean', async () => {
		// Fetch the board and NCS version
		let config: Config = context.workspaceState.get("config") ?? {};

		// Flash board
		if (config != {}) {
			await clean(config);
		} else {
			// Display an error message box to the user
			vscode.window.showErrorMessage('Run `Zephyr Toools: Setup` command before flashing.');
		}
	}));

	// TODO: command for loading via `newtmgr`

}

// TODO: select programmer ID if there are multiple..
async function flash(config: Config) {

	// Create output
	if (output == undefined) {
		output = vscode.window.createOutputChannel("Zephyr SDK");
	}

	// Clear output
	output.clear();

	// Get the active workspace root path
	let rootPath = "";

	// Return if rootPath undefined
	if (rootPath == undefined) {
		return;
	}

	// Dest path
	// let destPath = `${paths[platform]}/nrf/applications/user/${workspaceName}`;
	let destPath = "";

	// Create command based on current OS
	let cmd = "";
	cmd = "west flash";

	// Process slightly differently due to how windows is setup
	if (platform == "win32") {
		// cmd = `${paths["win"]}\\toolchain\\git-bash.exe -c "cd ${rootPath} && ${cmd}"`
	}

	// Show output as things begin.
	output.show();

	// Promisified exec
	let exec = util.promisify(cp.exec);

	// TOOO: handle real-time stream during build
	// Show we're building..
	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Flashing board",
		cancellable: false
	}, async (progress, token) => {

		token.onCancellationRequested(() => {
			console.log("User canceled the long running operation");
		});

		// Execute the task
		await exec(cmd, { cwd: destPath, env: config.env }).then((value) => {
			output.append(value.stdout);
			output.append(value.stderr);
		}, (reason) => {
			output.append(reason.stdout);
			console.info(reason.stdout);
			output.append(reason.stderr);
			console.error(reason.stderr);
			// Error message 
			vscode.window.showErrorMessage('Error flashing. Check output for more info.');
		});

		progress.report({ increment: 100 });
		output.dispose()
	});

}

async function getProjectList(folder: vscode.Uri): Promise<string[]> {

	let files = await vscode.workspace.fs.readDirectory(folder);
	let projects: string[] = [];

	while (true) {

		let file = files.pop();

		// Stop looping once done.
		if (file == undefined)
			break;

		if (file[0].includes("CMakeLists.txt")) {

			// Check the filefolder
			let filepath = vscode.Uri.joinPath(folder, file[0]);
			let contents = await vscode.workspace.openTextDocument(filepath).then((document) => {
				return document.getText();
			});

			if (contents.includes("project(")) {
				projects.push(filepath.fsPath.replace("CMakeLists.txt", ""));
			}
		}
		else if (file[0].includes("build") || file[0].includes(".git")) {
			// Don't do anything
		}
		else if (file[1] == vscode.FileType.Directory) {
			let path = vscode.Uri.joinPath(folder, file[0]);
			let subfolders = await vscode.workspace.fs.readDirectory(path);

			for (let { index, value } of subfolders.map((value, index) => ({ index, value }))) {
				subfolders[index][0] = vscode.Uri.parse(`${file[0]}/${subfolders[index][0]}`).fsPath;
				// console.log(subfolders[index][0]);
			}

			files = files.concat(subfolders);
		}
	}

	return projects;

}

async function changeProject(config: Config, context: vscode.ExtensionContext) {

	// Create & clear output
	if (output == undefined) {
		output = vscode.window.createOutputChannel("Zephyr SDK");
	}

	// Get the workspace root
	let rootPath;
	let rootPaths = vscode.workspace.workspaceFolders;
	if (rootPaths == undefined) {
		return;
	} else {
		rootPath = rootPaths[0].uri;
	}

	// Promisified exec
	let exec = util.promisify(cp.exec);

	// Clear output before beginning
	output.clear();

	// Get manifest path `west config manifest.path`
	let cmd = "west config manifest.path";
	let res = await exec(cmd, { env: config.env, cwd: rootPath.fsPath });
	if (res.stderr) {
		output.append(res.stderr);
		output.show();
		return;
	}

	// Find all CMakeLists.txt files with `project(` in them
	let files = await getProjectList(vscode.Uri.joinPath(rootPath, res.stdout.trim()))
	console.log(files);

	// Turn that into a project selection 
	const result = await vscode.window.showQuickPick(files, {
		placeHolder: 'Pick your target project..',
		onDidSelectItem: item => vscode.window.showInformationMessage(`Project changed to ${item}`)
	});

	if (result) {
		console.log("Changing project to " + result);
		config.project = result;
		context.workspaceState.update("config", config);
	}

}

async function changeBoard(config: Config, context: vscode.ExtensionContext) {

	// Prompt which board to use
	const result = await vscode.window.showQuickPick(boards, {
		placeHolder: 'Pick your board..',
		onDidSelectItem: item => vscode.window.showInformationMessage(`Board changed to ${item}`)
	});

	if (result) {

		console.log("Changing board to " + result);
		config.board = result;
		context.workspaceState.update("config", config);
	}

};

async function build(config: Config, pristine: boolean, context: vscode.ExtensionContext) {

	// Return if env is not set 
	if (config.env == undefined) {
		console.log("Env is undefined!");
		return;
	}

	// Return if undefined
	if (config.board == undefined) {
		// Change board function
		await changeBoard(config, context);
	}

	// Options for SehllExecution
	let options: vscode.ShellExecutionOptions = {
		executable: "bash",
		shellArgs: ["-c"],
		env: <{ [key: string]: string; }>config.env
	}

	// Tasks
	let taskName = "Zephyr Tools: Build";
	let tasks: vscode.Task[] = [];

	// Enable python env
	// TODO: this is depening what platform..
	let cmd = `west build -b ${config.board}${pristine ? ' -p' : ''} -s ${config.project}`;
	let exec = new vscode.ShellExecution(cmd, options);

	// Task
	let task = new vscode.Task(
		{ type: "zephyr-tools", command: taskName },
		vscode.TaskScope.Workspace,
		taskName,
		"zephyr-tools",
		exec
	);
	tasks.push(task);

	// Iterate over each task
	for (let task of tasks) {
		await vscode.tasks.executeTask(task);
	}

	vscode.window.showInformationMessage(`Building for ${config.board}`);

}

async function clean(config: Config) {

	// Get the active workspace root path
	let rootPath;
	let rootPaths = vscode.workspace.workspaceFolders;
	if (rootPaths == undefined) {
		return;
	} else {
		rootPath = rootPaths[0].uri;
	}

	// Return if undefined
	if (rootPath == undefined || config.board == undefined) {
		return;
	}

	//Get build folder
	let buildFolder = vscode.Uri.joinPath(rootPath, "build");

	// Remove build folder
	await vscode.workspace.fs.delete(buildFolder, { recursive: true, useTrash: true });

}

// this method is called when your extension is deactivated
export function deactivate() { }