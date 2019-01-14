import { Directory, FileEntry, Root } from 'aspen-core'
import { IDisposable, Notificar } from 'notificar'
import { ISerializableState, TreeStateEvent } from './types'

export enum Operation {
	SetExpanded = 1,
	SetCollapsed,
	SetActive,
}

enum StashKeyFrameFlag {
	Expanded = 1,
	Collapsed = 2,
	Disabled = 4,
}

export class TreeStateManager {
	private root: Root
	private events: Notificar<TreeStateEvent> = new Notificar()
	private expandedDirectories: Map<Directory, string> = new Map()
	private _scrollOffset: number = 0
	private stashing: boolean = false
	private stashKeyframes: Map<number, StashKeyFrameFlag>
	private stashLockingItems: Set<FileEntry> = new Set()
	constructor(root: Root) {
		this.root = root
		this.root.onDidChangeDirExpansionState(this.handleExpansionChange)
		this.root.onDidChangePath(this.handleDidChangePath)
	}

	get scrollOffset() {
		return this._scrollOffset
	}

	public saveScrollOffset(scrollOffset: number) {
		this._scrollOffset = scrollOffset
		this.events.dispatch(TreeStateEvent.DidChangeScrollOffset, scrollOffset)
	}

	public onDidLoadState(callback: () => void): IDisposable {
		return this.events.add(TreeStateEvent.DidLoadState, callback)
	}

	public onChangeScrollOffset(callback: (newOffset: number) => void): IDisposable {
		return this.events.add(TreeStateEvent.DidChangeScrollOffset, callback)
	}

	public onDidChangeDirExpansionState(callback: (relDirPath: string, nowExpanded: boolean, visibleAtSurface: boolean) => void): IDisposable {
		return this.events.add(TreeStateEvent.DidChangeDirExpansionState, callback)
	}

	public onDidChangeRelativePath(callback: (prevPath: string, newPath: string) => void): IDisposable {
		return this.events.add(TreeStateEvent.DidChangeRelativePath, callback)
	}

	/**
	 * Starts recording directory expands and collapses
	 *
	 * `reverseStash` can then be used to undo all those actions.
	 *
	 * Internally used by `FileTree#peekABoo`
	 *
	 * Stashing can be used for peeking file(s) temporarily, where you don't want a mess of expanded folders for user to deal with.
	 *
	 * `beginStashing` => then expand the folder(s) you need to get to the file you want => `endStahsing` => once you're done => `reverseStash` to clean up the mess
	 */
	public beginStashing() {
		this.stashing = true
		this.stashKeyframes = new Map()
	}

	/**
	 * Ends the recording session of directory expands and collapses
	 *
	 * See documentation for `beginStashing` for details
	 */
	public endStashing() {
		this.stashing = false
		this.stashLockingItems.clear()
	}

	/**
	 * Reverses all the recorded directory expands and collapses
	 *
	 * See documentation for `beginStashing` for details
	 */
	public async reverseStash() {
		if (!this.stashKeyframes) {
			return
		}
		this.endStashing()
		const keyframes = Array.from(this.stashKeyframes)
		this.stashKeyframes = null
		for (const [targetID, flags] of keyframes) {
			const frameDisabled = (flags & StashKeyFrameFlag.Disabled) === StashKeyFrameFlag.Disabled
			const target: Directory = FileEntry.getFileEntryById(targetID) as Directory
			// Check if target is still available (not disposed)
			if (!target || frameDisabled) {
				continue
			}
			if ((flags & StashKeyFrameFlag.Expanded) === StashKeyFrameFlag.Expanded) {
				this.root.collapseDirectory(target)
			} else if ((flags & StashKeyFrameFlag.Collapsed) === StashKeyFrameFlag.Collapsed) {
				await this.root.expandDirectory(target)
			}
		}
	}

	public async loadTreeState(state: ISerializableState) {
		if (state) {
			for (const relDirPath of state.expandedDirectories.buried) {
				try {
					const dirH = await this.root.forceLoadFileEntryAtPath(relDirPath)
					if (dirH && dirH.constructor === Directory) {
						await this.root.expandDirectory(dirH as Directory, false)
					}
				} catch (error) { }
			}
			for (const relDirPath of state.expandedDirectories.atSurface) {
				try {
					const dirH = await this.root.forceLoadFileEntryAtPath(relDirPath)
					if (dirH && dirH.constructor === Directory) {
						await this.root.expandDirectory(dirH as Directory, true)
					}
				} catch (error) { }
			}
			this._scrollOffset = typeof state.scrollPosition === 'number' && state.scrollPosition > -1 ? state.scrollPosition : this._scrollOffset
			this.events.dispatch(TreeStateEvent.DidLoadState)
		}
	}

	/**
	 * This will ensure directory expansions aren't altered atleast for directories leading to file to be excluded when `reverseStash` is called
	 */
	public excludeFromStash(file: FileEntry | Directory) {
		if (this.stashKeyframes && !this.stashing) {
			this.handleExpansionChange(file.constructor === FileEntry ? file.parent : file as Directory, true, this.root.isItemVisibleAtSurface(file))
		}
	}

	private handleExpansionChange = (target: Directory, isExpanded: boolean, isVisibleAtSurface: boolean) => {
		if (this.stashing) {
			this.stashKeyframes.set(target.id, isExpanded ? StashKeyFrameFlag.Expanded : StashKeyFrameFlag.Collapsed)
		}
		if (this.stashKeyframes && !this.stashing) {
			// If something was "manually" (through user interaction) expanded *after* recording ended, we must remove its parents from undo queue
			if (isExpanded) {
				let p: Directory = target
				while (p) {
					if (this.stashKeyframes.has(p.id)) {
						let flags = this.stashKeyframes.get(p.id)
						flags |= StashKeyFrameFlag.Disabled
						this.stashKeyframes.set(p.id, flags)
					}
					p = p.parent
				}
				this.stashLockingItems.add(target)
			}
			if (this.stashLockingItems && this.stashLockingItems.has(target) && !isExpanded) {
				let p: Directory = target
				while (p) {
					if (this.stashKeyframes.has(p.id)) {
						let flags = this.stashKeyframes.get(p.id)
						flags &= ~StashKeyFrameFlag.Disabled
						this.stashKeyframes.set(p.id, flags)
					}
					p = p.parent
				}
				this.stashLockingItems.delete(target)
			}
		}
		let relativePath = this.expandedDirectories.get(target)
		if (isExpanded && !relativePath) {
			relativePath = this.root.pathfx.relative(this.root.path, target.path)
			this.expandedDirectories.set(target, relativePath)
			this.events.dispatch(TreeStateEvent.DidChangeDirExpansionState, relativePath, isExpanded, isVisibleAtSurface)
		} else if (!isExpanded && relativePath) {
			this.expandedDirectories.delete(target)
			this.events.dispatch(TreeStateEvent.DidChangeDirExpansionState, relativePath, isExpanded, isVisibleAtSurface)
		}
	}

	private handleDidChangePath = (target: Directory) => {
		if (this.expandedDirectories.has(target)) {
			const prevPath = this.expandedDirectories.get(target)
			const newPath = this.root.pathfx.relative(this.root.path, target.path)
			this.expandedDirectories.set(target, newPath)
			this.events.dispatch(TreeStateEvent.DidChangeRelativePath, prevPath, newPath)
		}
	}
}
