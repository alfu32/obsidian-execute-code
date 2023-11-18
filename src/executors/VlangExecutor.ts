import NonInteractiveCodeExecutor from './NonInteractiveCodeExecutor';
import * as child_process from "child_process";
import type {ChildProcessWithoutNullStreams} from "child_process";
import type {Outputter} from "src/Outputter";
import type {ExecutorSettings} from "src/settings/Settings";
import {mkdirSync as mkdir,existsSync as is,writeFileSync as write,readFileSync as read,readdirSync as ls, writeFileSync, writeSync, mkdirSync, existsSync} from 'fs';
import {resolve as resolvePath} from 'path';
import NodeJSExecutor from './NodeJSExecutor';
import { mainModule } from 'process';
import test from 'node:test';
export default abstract class VlangExecutor extends NonInteractiveCodeExecutor {
	
	language: "v";
	project:string;

	constructor(settings: ExecutorSettings, file: string, language: "v") {
		super(settings, false, file, language);
		this.initProjectShell()
	}
	private initProjectShell(){
		return new Promise((resolve:(value:unknown)=>void,reject:(reason?:any)=>void) =>{
			// just a call to initialize tempFileId
			this.tempFileId = Date.now().toString();
			this.project=resolvePath(process.env.HOME)
			console.log({scope:"obsidian.execute-code.v-executor.init",message:{
				cwd:this.project,
				env: {...process.env,...JSON.parse(this.settings.environmentVariables)},
				shell: this.usesShell
			}})
			this.file = resolvePath(this.project,`v-${this.tempFileId}.vsh`)
			resolve(this)
		})
	}

	override run(codeBlockContent: string, outputter: Outputter, cmd: string, args: string, ext: string) {
		console.log({
			scope:"obsidian.execute-code.v-executor.run",
			codeBlockContent,
			outputter,
			cmd,
			args,
			ext,
			executor:this
		})
		
		// Run code with a main block
		writeFileSync(this.file,codeBlockContent)

		// Run code without a main block
		return new Promise<void>((resolve, reject) => {
			const childArgs = ["run",this.file];
			const child = child_process.spawn(this.settings.vlangPath, childArgs, {
				cwd:this.project,
				env: {...process.env,...JSON.parse(this.settings.environmentVariables)},
				shell: this.usesShell
			});
			// Set resolve callback to resolve the promise in the child_process.on('close', ...) listener from super.handleChildOutput
			this.resolveRun = resolve;
			this.handleChildOutput(child, outputter, this.tempFileId);
		});
	}

	/**
	 * Run parent NonInteractiveCodeExecutor handleChildOutput logic, but replace temporary main function name
	 * In all outputs from stdout and stderr callbacks, from temp_<id>() to main() to produce understandable output
	 */
	override async handleChildOutput(child: ChildProcessWithoutNullStreams, outputter: Outputter, fileName: string) {		
		super.handleChildOutput(child, outputter, fileName);
		// Remove existing stdout and stderr callbacks
		child.stdout.removeListener("data", this.stdoutCb);
		child.stderr.removeListener("data", this.stderrCb);
		const fileId = this.tempFileId;
		// Replace temp_<id>() with main()
		const replaceTmpId = (data: string) => {
			return data.replace(new RegExp(`temp_${fileId}\\(\\)`, "g"), "main()");
		}
		// Set new stdout and stderr callbacks, the same as in the parent,
		// But replacing temp_<id>() with main()
		child.stdout.on("data", (data) => {
			this.stdoutCb(replaceTmpId(data.toString()));
		});
		child.stderr.on("data", (data) => {
			this.stderrCb(replaceTmpId(data.toString()));
		});
	}
}
