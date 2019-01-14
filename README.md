# State container for Aspen trees

All the information about a tree. In one place.

*Core component of [`react-aspen`](https://github.com/neeksandhu/react-aspen)*

## So what is it?

View libraries which leverage `aspen-core` for rendering nested trees can leverage this package as a state container for those Trees. Said libraries can
then give users the ability to save the tree state to serializable JSON string and then restore from it the next time users comes back to the app.

As of now, that "state" includes expanded directories and precise scroll position. Both of which are available in a serializable format and as "snapshots".

## Usage

You shouldn't have to use this package "as is" unless you're porting `react-aspen` to another framework.

```bash
npm i aspen-tree-model
```

> This example assumes you're using this package with `react-aspen` (Other ports shouldn't be much different)

This package offers `TreeModel`, the thing incharge of stuff. `TreeModel` is exported by `react-aspen` and an instance of it expected by `FileTree` component.

```tsx
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { FileTree, TreeModel, TreeStateChangeType } from 'react-aspen'

class FileTreeItem extends React.Component {
    render() { }
}

const host: IBasicFileSystemHost = { pathStyle: 'unix', getItems: async (path) => { /* impl */ }}

const treeModel: TreeModel = new TreeModel(host, '/')

ReactDOM.render(
    <FileTree width={400} height={700} model={treeModel}>
        {({item, itemType}) => <FileTreeItem item={item} itemType={itemType} />}
    </FileTree>
    , document.getElementById('app'))
```

Here are some points of interest:

```typescript
// observe tree state as it changes
const tsw = treeModel.getTreeStateWatcher()

// attach a callback (will be called everytime user scrolls or expands/collapses a directory)
// remember even the slightest scroll will trigger this callback, which can lead to performance issues
// either throttle your callback or ignore based on `changeType`
tsw.onChange((changeType: TreeStateChangeType) => {
    // changeType can be `TreeStateChangeType.ScrollOffset` | `TreeStateChangeType.DirExpansionState` | `TreeStateChangeType.PathsUpdated`

    // take a snapshot (it's not a JSON string, but an object) (expanded directories + scroll position))
    // restoring this snapshot will bring the tree to this exact state (overiding the alterations made by user)
    const snapshot = tsw.snapshot()

    // time travel to this snapshot after 5 seconds
    setTimeout(() => {
        treeModel.loadTreeState(snapshot)
    }, 5000)

    // or save to some storage (like `localStorage`) and load it next time the user launches your app
    // ⚠ WARNING: Use a throttler to ensure you don't do this too often (every scroll will trigger `onChange` callback)
    const serializedState = tsw.toString()

    // save the state to `localStorage`
    // When the user launches your app next time, just do `treeModel.loadTreeState(localStorage.get('aspen_tree_state'))`
    localStorage.set('aspen_tree_state', serializedState) 
})

// If at any point in your app's lifecycle you decide you're done with the watcher, remember to purge it properly
tsw.dispose()

```

## API

This package is written in TypeScript. Type definitions are included when you install this package (directly or indirectly through a dependent library).

You can explore the full API [here](https://neeksandhu.github.io/aspen-tree-model).

## License

This project is licensed under MIT license. You are free to use, modify, distribute the code as you like (credits although not required, are highly appreciated)
