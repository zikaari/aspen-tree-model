import { DisposablesComposite, IDisposable, Notificar } from 'notificar'
import { TreeStateManager } from './TreeStateManager'
import { ISerializableState, TreeStateEvent, TreeStateWatcherChangeType as TreeStateChangeType } from './types'

export class TreeStateWatcher implements IDisposable {
	private events: Notificar<TreeStateEvent> = new Notificar()
	private _disposed: boolean = false
	private disposables: DisposablesComposite = new DisposablesComposite()
	private currentState: ISerializableState = {
		specVersion: 1,
		scrollPosition: 0,
		expandedDirectories: {
			atSurface: [],
			buried: [],
		},
	}

	constructor(
		private readonly treeState: TreeStateManager,
		private readonly atSurfaceExpandedDirsOnly: boolean = false,
	) {
		this.disposables.add(treeState.onChangeScrollOffset((newOffset: number) => {
			this.currentState.scrollPosition = newOffset
			this.events.dispatch(TreeStateEvent.DidChange, TreeStateChangeType.ScrollOffset)
		}))
		this.disposables.add(treeState.onDidChangeRelativePath((prevPath: string, newPath: string) => {
			let shouldNotify = false
			const atSurfaceIdx = this.currentState.expandedDirectories.atSurface.indexOf(prevPath)
			if (atSurfaceIdx > -1) {
				this.currentState.expandedDirectories.atSurface[atSurfaceIdx] = newPath
				shouldNotify = true
			}

			if (atSurfaceExpandedDirsOnly) {
				const buriedIdx = this.currentState.expandedDirectories.buried.indexOf(prevPath)
				if (buriedIdx > -1) {
					this.currentState.expandedDirectories.buried[buriedIdx] = newPath
					shouldNotify = true
				}
			}
			if (shouldNotify) {
				this.events.dispatch(TreeStateEvent.DidChange, TreeStateChangeType.PathsUpdated)
			}
		}))

		this.disposables.add(treeState.onDidChangeDirExpansionState((relDirPath: string, nowExpanded: boolean, isVisibleAtSurface: boolean) => {
			let shouldNotify = false
			const atSurfaceIdx = this.currentState.expandedDirectories.atSurface.indexOf(relDirPath)
			if (atSurfaceIdx > -1 && (!nowExpanded || !isVisibleAtSurface)) {
				this.currentState.expandedDirectories.atSurface.splice(atSurfaceIdx, 1)
				shouldNotify = true
			} else if (nowExpanded && isVisibleAtSurface) {
				this.currentState.expandedDirectories.atSurface.push(relDirPath)
				shouldNotify = true
			}

			if (!atSurfaceExpandedDirsOnly) {
				const buriedIdx = this.currentState.expandedDirectories.buried.indexOf(relDirPath)
				if (buriedIdx > -1 && (!nowExpanded || isVisibleAtSurface)) {
					this.currentState.expandedDirectories.buried.splice(buriedIdx, 1)
					shouldNotify = true
				} else if (nowExpanded && !isVisibleAtSurface) {
					this.currentState.expandedDirectories.buried.push(relDirPath)
					shouldNotify = true
				}
			}
			if (shouldNotify) {
				this.events.dispatch(TreeStateEvent.DidChange, TreeStateChangeType.DirExpansionState)
			}
		}))
	}

	public dispose() {
		if (this._disposed) {
			return
		}
		this._disposed = true
		this.disposables.dispose()
	}

	public onChange(callback: (changeType: TreeStateChangeType) => void): IDisposable {
		return this.events.add(TreeStateEvent.DidChange, callback)
	}

	public snapshot(): ISerializableState {
		return {
			...this.currentState,
			expandedDirectories: {
				atSurface: this.currentState.expandedDirectories.atSurface.slice(),
				buried: this.currentState.expandedDirectories.buried.slice(),
			},
		}
	}

	public toString() {
		return JSON.stringify(this.currentState)
	}
}
