import { SetDomElementHeight, GetDomElementOuterHeight, AddDiv, CreateDiv } from '../engine/viewer/domutils.js';
import { NavigatorPanel } from './navigatorpanel.js';
import { TreeViewButton, TreeViewButtonItem, TreeViewGroupItem, TreeViewSingleItem } from './treeview.js';
import { AddSvgIconElement } from './utils.js';
import { Loc } from '../engine/core/localization.js';

export class NavigatorFilesPanel extends NavigatorPanel
{
    constructor (parentDiv)
    {
        super (parentDiv);

        // Create title buttons for JOBS folder functionality
        this.titleButtonsDiv = AddDiv (this.titleDiv, 'ov_navigator_tree_title_buttons');

        // JOBS folder button
        this.jobsFolderButton = AddDiv (this.titleButtonsDiv, 'ov_navigator_button right');
        this.jobsFolderButton.setAttribute ('alt', Loc ('Select JOBS folder'));
        this.jobsFolderButton.setAttribute ('title', Loc ('Select JOBS folder'));
        AddSvgIconElement (this.jobsFolderButton, 'open');

        // Clear JOBS folder button
        this.clearJobsButton = AddDiv (this.titleButtonsDiv, 'ov_navigator_button right');
        this.clearJobsButton.setAttribute ('alt', Loc ('Clear JOBS folder'));
        this.clearJobsButton.setAttribute ('title', Loc ('Clear JOBS folder'));
        AddSvgIconElement (this.clearJobsButton, 'close');
        this.clearJobsButton.style.display = 'none'; // Initially hidden

        // Refresh button
        this.refreshButton = AddDiv (this.titleButtonsDiv, 'ov_navigator_button right');
        this.refreshButton.setAttribute ('alt', Loc ('Refresh JOBS folder'));
        this.refreshButton.setAttribute ('title', Loc ('Refresh JOBS folder'));
        AddSvgIconElement (this.refreshButton, 'refresh');
        this.refreshButton.style.display = 'none'; // Initially hidden

        // Initialize JOBS folder state
        this.jobsFolderHandle = null;
        this.jobsFiles = [];
        this.supportsFileSystemAccess = 'showDirectoryPicker' in window;

        // Bind event handlers
        this.jobsFolderButton.addEventListener ('click', () => {
            this.SelectJobsFolder ();
        });

        this.clearJobsButton.addEventListener ('click', () => {
            this.ClearJobsFolder ();
        });

        this.refreshButton.addEventListener ('click', () => {
            this.RefreshJobsFolder ();
        });

        // Try to restore previously selected folder
        this.RestoreJobsFolder ();
    }

    GetName ()
    {
        return Loc ('Files');
    }

    GetIcon ()
    {
        return 'files';
    }

    Resize ()
    {
        let titleHeight = GetDomElementOuterHeight (this.titleDiv);
        let height = this.parentDiv.offsetHeight;
        SetDomElementHeight (this.treeDiv, height - titleHeight);
    }

    Clear ()
    {
        super.Clear ();
    }

    Fill (importResult)
    {
        super.Fill (importResult);

        // Check if we have JOBS folder files to show
        if (this.jobsFiles.length > 0) {
            this.FillWithJobsFiles ();
        } else {
            this.FillWithImportedFiles (importResult);
        }
    }

    FillWithJobsFiles ()
    {
        // Create JOBS folder section
        let jobsSection = new TreeViewGroupItem (Loc ('JOBS Folder'), null);
        jobsSection.ShowChildren (true);
        this.treeView.AddChild (jobsSection);

        for (let i = 0; i < this.jobsFiles.length; i++) {
            let file = this.jobsFiles[i];
            let item = new TreeViewButtonItem (file.name);

            // Add load button
            let loadButton = new TreeViewButton ('open');
            loadButton.OnClick (() => {
                if (this.callbacks && this.callbacks.onJobsFileSelected) {
                    this.callbacks.onJobsFileSelected (file);
                }
            });
            item.AppendButton (loadButton);
            jobsSection.AddChild (item);
        }
    }

    FillWithImportedFiles (importResult)
    {
        const usedFiles = importResult.usedFiles;
        const missingFiles = importResult.missingFiles;

        if (missingFiles.length > 0) {
            let missingFilesItem = new TreeViewGroupItem (Loc ('Missing Files'), null);
            missingFilesItem.ShowChildren (true);
            this.treeView.AddChild (missingFilesItem);
            for (let i = 0; i < missingFiles.length; i++) {
                let file = missingFiles[i];
                let item = new TreeViewButtonItem (file);
                let browseButton = new TreeViewButton ('open');
                browseButton.OnClick (() => {
                    this.callbacks.onFileBrowseButtonClicked ();
                });
                item.AppendButton (browseButton);
                missingFilesItem.AddChild (item);
            }
            let filesItem = new TreeViewGroupItem (Loc ('Available Files'), null);
            filesItem.ShowChildren (true);
            this.treeView.AddChild (filesItem);
            for (let i = 0; i < usedFiles.length; i++) {
                let file = usedFiles[i];
                let item = new TreeViewSingleItem (file);
                filesItem.AddChild (item);
            }
        } else {
            for (let i = 0; i < usedFiles.length; i++) {
                let file = usedFiles[i];
                let item = new TreeViewSingleItem (file);
                this.treeView.AddChild (item);
            }
        }
    }

    async SelectJobsFolder ()
    {
        if (!this.supportsFileSystemAccess) {
            alert (Loc ('Your browser does not support the File System Access API. Please use a modern browser like Chrome or Edge.'));
            return;
        }

        try {
            this.jobsFolderHandle = await window.showDirectoryPicker ();
            await this.StoreJobsFolder ();
            await this.RefreshJobsFolder ();

            // Update button visibility
            this.UpdateButtonVisibility ();

            // Automatically switch to modeling view when folder is selected
            if (this.callbacks && this.callbacks.onJobsFolderLoaded) {
                this.callbacks.onJobsFolderLoaded ();
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error ('Error selecting JOBS folder:', error);
            }
        }
    }

    async StoreJobsFolder ()
    {
        if (!this.jobsFolderHandle) {
            return;
        }

        try {
            // Store the directory handle in IndexedDB
            const request = indexedDB.open ('Online3DViewer', 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains ('settings')) {
                    db.createObjectStore ('settings');
                }
            };

            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction (['settings'], 'readwrite');
                const store = transaction.objectStore ('settings');
                store.put (this.jobsFolderHandle, 'jobsFolderHandle');
                db.close ();
            };
        } catch (error) {
            console.error ('Error storing JOBS folder:', error);
        }
    }

    async RestoreJobsFolder ()
    {
        if (!this.supportsFileSystemAccess) {
            return;
        }

        try {
            const request = indexedDB.open ('Online3DViewer', 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains ('settings')) {
                    db.createObjectStore ('settings');
                }
            };

            request.onsuccess = async (event) => {
                const db = event.target.result;
                const transaction = db.transaction (['settings'], 'readonly');
                const store = transaction.objectStore ('settings');
                const getRequest = store.get ('jobsFolderHandle');

                getRequest.onsuccess = async () => {
                    if (getRequest.result) {
                        try {
                            // Verify we still have permission to access the folder
                            this.jobsFolderHandle = getRequest.result;
                            const permission = await this.jobsFolderHandle.requestPermission ({ mode: 'read' });

                            if (permission === 'granted') {
                                await this.RefreshJobsFolder ();

                                // Automatically switch to modeling view when folder is restored
                                if (this.callbacks && this.callbacks.onJobsFolderLoaded) {
                                    this.callbacks.onJobsFolderLoaded ();
                                }

                                this.UpdateButtonVisibility ();
                            } else {
                                // Permission denied, clear stored handle
                                this.ClearStoredJobsFolder ();
                            }
                        } catch (error) {
                            console.log ('Stored folder no longer accessible:', error);
                            this.ClearStoredJobsFolder ();
                        }
                    }
                };

                db.close ();
            };
        } catch (error) {
            console.error ('Error restoring JOBS folder:', error);
        }
    }

    async ClearStoredJobsFolder ()
    {
        try {
            const request = indexedDB.open ('Online3DViewer', 1);

            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction (['settings'], 'readwrite');
                const store = transaction.objectStore ('settings');
                store.delete ('jobsFolderHandle');
                db.close ();
            };
        } catch (error) {
            console.error ('Error clearing stored JOBS folder:', error);
        }

        this.jobsFolderHandle = null;
        this.jobsFiles = [];
        this.UpdateButtonVisibility ();
    }

    async ClearJobsFolder ()
    {
        await this.ClearStoredJobsFolder ();

        // Refresh the display to show regular imported files instead
        this.treeView.Clear ();
        this.UpdateButtonVisibility ();

        // If we're in model view with no model, go back to intro
        if (!this.HasCurrentModel()) {
            // Go back to intro screen since we don't have a folder or model
            if (this.callbacks && this.callbacks.onJobsFolderCleared) {
                this.callbacks.onJobsFolderCleared ();
            }
        }
    }

    UpdateButtonVisibility ()
    {
        const hasFolderSelected = this.jobsFolderHandle !== null;

        // Show/hide buttons based on whether a folder is selected
        this.clearJobsButton.style.display = hasFolderSelected ? 'block' : 'none';
        this.refreshButton.style.display = hasFolderSelected ? 'block' : 'none';
    }

    HasCurrentModel ()
    {
        // This should be implemented based on how the website tracks loaded models
        // For now, we'll assume no model if we only have JOBS folder content
        return false;
    }

    async RefreshJobsFolder ()
    {
        if (!this.jobsFolderHandle) {
            return;
        }

        try {
            const modelExtensions = ['.obj', '.ply', '.stl', '.off', '.3ds', '.wrl', '.fbx', '.collada', '.dae', '.gltf', '.glb', '.3mf', '.amf', '.ifc', '.brep', '.step', '.stp', '.iges', '.igs'];
            const newJobsFiles = [];

            for await (const entry of this.jobsFolderHandle.values()) {
                if (entry.kind === 'file') {
                    const fileName = entry.name.toLowerCase ();
                    const hasModelExtension = modelExtensions.some (ext => fileName.endsWith (ext));

                    if (hasModelExtension) {
                        const file = await entry.getFile ();
                        newJobsFiles.push ({
                            name: entry.name,
                            file: file,
                            handle: entry
                        });
                    }
                }
            }

            // Sort files by name
            newJobsFiles.sort ((a, b) => a.name.localeCompare (b.name));

            // Check if files have changed
            const filesChanged = this.HasJobsFilesChanged (newJobsFiles);
            this.jobsFiles = newJobsFiles;

            if (filesChanged) {
                // Refresh the display
                this.treeView.Clear ();
                this.FillWithJobsFiles ();
            }

        } catch (error) {
            console.error ('Error refreshing JOBS folder:', error);
        }
    }

    HasJobsFilesChanged (newFiles)
    {
        if (this.jobsFiles.length !== newFiles.length) {
            return true;
        }

        for (let i = 0; i < this.jobsFiles.length; i++) {
            if (this.jobsFiles[i].name !== newFiles[i].name) {
                return true;
            }
        }

        return false;
    }
}
