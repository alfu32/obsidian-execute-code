import NonInteractiveCodeExecutor from './NonInteractiveCodeExecutor';
import * as child_process from "child_process";
import type {ChildProcessWithoutNullStreams} from "child_process";
import type {Outputter} from "src/Outputter";
import type {ExecutorSettings} from "src/settings/Settings";
import {mkdirSync as mkdir,existsSync as is,writeFileSync as write,readFileSync as read,readdirSync as ls} from 'fs';
import {resolve as resolvePath} from 'path';
import NodeJSExecutor from './NodeJSExecutor';
import { mainModule } from 'process';
import test from 'node:test';
export default abstract class ZigExecutor extends NonInteractiveCodeExecutor {
	
	language: "zig";
	project:string;

	constructor(settings: ExecutorSettings, file: string, language: "zig") {
		super(settings, false, file, language);
		this.initProjectShell()
	}
	private initProjectShell(){
		return new Promise((resolve:(value:unknown)=>void,reject:(reason?:any)=>void) =>{
			// just a call to initialize tempFileId
			this.tempFileId = Date.now().toString();
			this.project=resolvePath(process.env.HOME,`zig-${this.tempFileId}`)
			mkdir(this.project)
			const child = child_process.spawn(this.settings.zigPath, ["init-exe"], {
				cwd:this.project,
				env: process.env,
				shell: this.usesShell
			});
			child.addListener("close",_maybe_success_handler)
			child.addListener("disconnect",reject)
			child.addListener("error",reject)
			child.addListener("exit",_maybe_success_handler)
			child.addListener("message",_message_handler)
			child.addListener("spawn",_message_handler)
			function _maybe_success_handler(code:number,signal:NodeJS.Signals) :void{
				if(code===0){
					resolve({})
				}else{
					reject({})
				}
			}
			function _message_handler(...args:[]) :void{
				console.log({scope:"obsidian.execute-code.zig-executor",message:args})
			}
		})
	}

	override run(codeBlockContent: string, outputter: Outputter, cmd: string, args: string, ext: string) {
		
		// Run code with a main block
		if (this.settings.zigRun==="script") {
			write(resolvePath(this.project,"src","main.zig"),`pub fn main() !void {
				${codeBlockContent}
			}`)
		} else {
			write(resolvePath(this.project,"src","main.zig"),codeBlockContent)
		}
		let runnerArgs = ["build","run"];
		if (this.settings.zigRun==="test") {
			runnerArgs = ["build","test"];
		} else {
			runnerArgs = ["build","run"];
		}

		// Run code without a main block
		return new Promise<void>((resolve, reject) => {
			const childArgs = [...runnerArgs,...args.split(" ")];
			const child = child_process.spawn(this.settings.zigPath, childArgs, {
				cwd:this.project,
				env: process.env,
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
