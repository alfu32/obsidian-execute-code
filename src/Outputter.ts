import {EventEmitter} from "events";
import loadEllipses from "./svgs/loadEllipses";
import loadSpinner from "./svgs/loadSpinner";


export class Outputter extends EventEmitter {
	codeBlockElement: HTMLElement;
	outputElement: HTMLElement;
	clearButton: HTMLButtonElement;
	lastPrintElem: HTMLSpanElement;
	lastPrinted: string;

	inputElement: HTMLInputElement;
	
	loadStateIndicatorElement: HTMLElement;

	hadPreviouslyPrinted: boolean;
	inputState: "NOT_DOING" | "OPEN" | "CLOSED" | "INACTIVE";

	constructor(codeBlock: HTMLElement, doInput: boolean) {
		super();

		this.inputState = doInput ? "INACTIVE" : "NOT_DOING";
		this.codeBlockElement = codeBlock;
		this.hadPreviouslyPrinted = false;
	}

	/**
	 * Clears the output log.
	 */
	clear() {
		if (this.outputElement) {
			for (const child of Array.from(this.outputElement.children)) {
				if (child instanceof HTMLSpanElement)
					this.outputElement.removeChild(child);
			}
		}
		this.lastPrintElem = null;
		this.hadPreviouslyPrinted = false;
		this.lastPrinted = "";

		if (this.clearButton)
			this.clearButton.className = "clear-button-disabled";

		this.closeInput();
		this.inputState = "INACTIVE";
	}

	/**
	 * Hides the output and clears the log. Visually, restores the code block to its initial state.
	 */
	delete() {
		if (this.outputElement)
			this.outputElement.style.display = "none";

		this.clear()
	}

	/**
	 * Add a segment of stdout data to the outputter
	 * @param text The stdout data in question
	 */
	write(text: string) {
		// Keep output field and clear button invisible if no text was printed.
		if (this.textPrinted(text)) {
			this.addStdout().innerHTML += text;

			// make visible again:
			this.makeOutputVisible();
		}
	}

	/**
	 * Add a segment of stderr data to the outputter
	 * @param text The stderr data in question
	 */
	writeErr(text: string) {
		// Keep output field and clear button invisible if no text was printed.
		if (this.textPrinted(text)) {
			this.addStderr().appendText(text);

			// make visible again:
			this.makeOutputVisible()
		}
	}

	/**
	 * Hide the input element. Stop accepting input from the user.
	 */
	closeInput() {
		this.inputState = "CLOSED";
		if (this.inputElement)
			this.inputElement.style.display = "none";
	}
	
	/**
	 * Mark the block as running
	 */
	startBlock() {
		if(!this.loadStateIndicatorElement) this.addLoadStateIndicator();
		
		this.loadStateIndicatorElement.style.display = "block";
		
		this.loadStateIndicatorElement.empty();
		this.loadStateIndicatorElement.appendChild(loadSpinner());
		
		this.loadStateIndicatorElement.setAttribute("aria-label", "This block is running");
	}
	
	/**
	 * Marks the block as queued, but waiting for another block before running
	 */
	queueBlock() {
		if (!this.loadStateIndicatorElement) this.addLoadStateIndicator();
		this.loadStateIndicatorElement.style.display = "block";
		
		this.loadStateIndicatorElement.empty();
		this.loadStateIndicatorElement.appendChild(loadEllipses());
		
		this.loadStateIndicatorElement.setAttribute("aria-label", "This block is waiting for another block to finish");
	}
	
	/** Marks the block as finished running */
	finishBlock() {
		if (this.loadStateIndicatorElement) {
			this.loadStateIndicatorElement.style.display = "none";
		}
	}
	
	private addLoadStateIndicator() {
		this.loadStateIndicatorElement = document.createElement("div");
		
		this.loadStateIndicatorElement.classList.add("load-state-indicator");
		
		this.getParentElement().parentElement.appendChild(this.loadStateIndicatorElement);
	}

	private getParentElement() {
		return this.codeBlockElement.parentElement as HTMLDivElement;
	}

	private addClearButton() {
		const parentEl = this.getParentElement();

		this.clearButton = document.createElement("button");
		this.clearButton.className = "clear-button";
		this.clearButton.setText("Clear");
		this.clearButton.addEventListener("click", () => this.delete());

		parentEl.appendChild(this.clearButton);
	}

	private addOutputElement() {
		const parentEl = this.getParentElement();

		const hr = document.createElement("hr");

		this.outputElement = document.createElement("code");
		this.outputElement.classList.add("language-output");

		this.outputElement.appendChild(hr);
		if (this.inputState != "NOT_DOING") this.addInputElement();
		parentEl.appendChild(this.outputElement);
	}

	/**
	 * Add an interactive input element to the outputter
	 */
	private addInputElement() {
		this.inputElement = document.createElement("input");
		this.inputElement.classList.add("interactive-stdin");
		this.inputElement.addEventListener("keypress", (e) => {
			if (e.key == "Enter") {
				this.processInput(this.inputElement.value + "\n");
				this.inputElement.value = "";
			}
		})


		this.outputElement.appendChild(this.inputElement);
	}

	/**
	 * Ensure that input from a user gets echoed to the outputter before being emitted to event subscribers.
	 *
	 * @param input a line of input from the user. In most applications, should end with a newline.
	 */
	private processInput(input: string) {
		this.addStdin().appendText(input);

		this.emit("data", input);
	}

	private addStdin(): HTMLSpanElement {
		return this.addStreamSegmentElement("stdin");
	}

	private addStderr(): HTMLSpanElement {
		return this.addStreamSegmentElement("stderr");
	}

	private addStdout(): HTMLSpanElement {
		return this.addStreamSegmentElement("stdout");
	}

	/**
	 * Creates a wrapper element for a segment of a standard stream.
	 * In order to intermingle the streams as they are output to, segments
	 * are more effective than one-element-for-each.
	 *
	 * If the last segment was of the same stream, it will be returned instead.
	 *
	 * @param streamId The standard stream's name (stderr, stdout, or stdin)
	 * @returns the wrapper `span` element
	 */
	private addStreamSegmentElement(streamId: "stderr" | "stdout" | "stdin"): HTMLSpanElement {
		if (!this.outputElement) this.addOutputElement();

		if (this.lastPrintElem)
			if (this.lastPrintElem.classList.contains(streamId)) return this.lastPrintElem;

		const stdElem = document.createElement("span");
		stdElem.addClass(streamId);

		if (this.inputElement) {
			this.outputElement.insertBefore(stdElem, this.inputElement);
		} else {
			this.outputElement.appendChild(stdElem);
		}
		this.lastPrintElem = stdElem;

		return stdElem
	}

	/**
	 * Checks if either:
	 * - this outputter has printed something before.
	 * - the given `text` is non-empty.
	 * If `text` is non-empty, this function will assume that it gets printed later.
	 *
	 * @param text Text which is to be printed
	 * @returns Whether text has been printed or will be printed
	 */
	private textPrinted(text: string) {
		if (this.hadPreviouslyPrinted) return true;

		if (text == "") return false;

		this.hadPreviouslyPrinted = true;
		return true;
	}

	/**
	 * Restores output elements after the outputter has been `delete()`d or `clear()`d.
	 * @see {@link delete()}
	 * @see {@link clear()}
	 */
	private makeOutputVisible() {
		if (!this.clearButton) this.addClearButton();
		if (!this.outputElement) this.addOutputElement();

		this.inputState = "OPEN";
		this.outputElement.style.display = "block";
		this.clearButton.className = "clear-button";

		setTimeout(() => {
			if (this.inputState == "OPEN") this.inputElement.style.display = "inline";
		}, 500)
	}
}
