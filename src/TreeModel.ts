import { IBasicFileSystemHost, Root } from 'aspen-core'
import { IDisposable, Notificar } from 'notificar'
import { ISerializableState, TreeStateManager, TreeStateWatcher } from './treeState'

enum TreeModelEvent {
	Change = 1,
}

export class TreeModel {
	public readonly state: TreeStateManager
	public readonly root: Root

	private events: Notificar<TreeModelEvent>

	constructor(host: IBasicFileSystemHost, rootPath: string) {
		this.root = new Root(host, rootPath)
		this.state = new TreeStateManager(this.root)
		this.events = new Notificar()

		this.root.onDidUpdate(this.dispatchChange)
	}

	public onChange(callback: () => void): IDisposable {
		return this.events.add(TreeModelEvent.Change, callback)
	}

	/**
	 * Restore tree state from given state.
	 *
	 * Included in TreeState:
	 *  - Directory expansion states
	 *  - Scroll offset
	 *
	 * Not included in TreeState:
	 *  - Decorations
	 *  - Prompts
	 *
	 * NOTE: ⚠ `loadTreeState` should be called and `await`ed **before** passing the `TreeModel` on to the `<FileTree />` component
	 */
	public async loadTreeState(state: string)
	public async loadTreeState(state: ISerializableState)
	public async loadTreeState(state: ISerializableState | string) {
		if (typeof state === 'string') {
			state = JSON.parse(state)
		}
		return this.state.loadTreeState(state as ISerializableState)
	}

	/**
	 * Returns a `TreeStateWatcher` that will stay in sync with actual tree state at all times
	 *
	 * Included in TreeState:
	 *  - Directory expansion states
	 *  - Scroll offset
	 *
	 * Not included in TreeState:
	 *  - Decorations
	 *  - Prompts
	 *
	 * Use `TreeStateWatcher#onChange` to attach a listener for when state is updated.
	 *
	 * Use `TreeStateWatcher#snapshot` to get snapshot of current tree state (not serialized, but serializable; use `JSON.stringify()`). You can make a time machine with this
	 *
	 * Use `TreeStateWatcher#toString` to convert the current state into a JSON string. Useful if you want save the current state to be able restore it later
	 */
	public getTreeStateWatcher(atSurfaceExpandedDirsOnly: boolean = false): TreeStateWatcher {
		return new TreeStateWatcher(this.state, atSurfaceExpandedDirsOnly)
	}

	private dispatchChange = () => {
		this.events.dispatch(TreeModelEvent.Change)
	}
}
