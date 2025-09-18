import { Coord3D } from '../engine/geometry/coord3d.js';
import { GetFileExtension, TransformFileHostUrls } from '../engine/io/fileutils.js';
import { InputFilesFromFileObjects, InputFilesFromUrls } from '../engine/import/importerfiles.js';
import { ImportErrorCode, ImportSettings } from '../engine/import/importer.js';
import { Camera, NavigationMode, ProjectionMode } from '../engine/viewer/camera.js';
import { RGBColor } from '../engine/model/color.js';
import { Viewer } from '../engine/viewer/viewer.js';
import { GetDefaultCamera } from '../engine/viewer/viewer.js';
import { AddDiv, AddDomElement, ShowDomElement, SetDomElementOuterHeight, CreateDomElement, GetDomElementOuterWidth, GetDomElementOuterHeight, IsDomElementVisible } from '../engine/viewer/domutils.js';

import * as THREE from 'three';
import { CalculatePopupPositionToScreen, ShowListPopup } from './dialogs.js';
import { HandleEvent } from './eventhandler.js';
import { HashHandler } from './hashhandler.js';
import { Navigator, Selection, SelectionType } from './navigator.js';
import { CameraSettings, Settings, Theme } from './settings.js';
import { Sidebar } from './sidebar.js';
import { ThemeHandler } from './themehandler.js';
import { ThreeModelLoaderUI } from './threemodelloaderui.js';
import { Toolbar } from './toolbar.js';
import { DownloadModel, ShowExportDialog } from './exportdialog.js';
import { ShowSnapshotDialog } from './snapshotdialog.js';
import { AddSvgIconElement, GetFilesFromDataTransfer, InstallTooltip, IsSmallWidth } from './utils.js';
import { ShowOpenUrlDialog } from './openurldialog.js';
import { ShowSharingDialog } from './sharingdialog.js';
import { GetDefaultMaterials, ReplaceDefaultMaterialsColor } from '../engine/model/modelutils.js';
import { Direction } from '../engine/geometry/geometry.js';
import { CookieGetBoolVal, CookieSetBoolVal } from './cookiehandler.js';
import { MeasureTool } from './measuretool.js';
import { CloseAllDialogs } from './dialog.js';
import { CreateVerticalSplitter } from './splitter.js';
import { EnumeratePlugins, PluginType } from './pluginregistry.js';
import { EnvironmentSettings } from '../engine/viewer/shadingmodel.js';
import { IntersectionMode } from '../engine/viewer/viewermodel.js';
import { Loc } from '../engine/core/localization.js';

const WebsiteUIState =
{
    Undefined : 0,
    Intro : 1,
    Model : 2,
    Loading : 3
};

class WebsiteLayouter
{
    constructor (parameters, navigator, sidebar, viewer, measureTool)
    {
        this.parameters = parameters;
        this.navigator = navigator;
        this.sidebar = sidebar;
        this.viewer = viewer;
        this.measureTool = measureTool;
        this.limits = {
            minPanelWidth : 290,
            minCanvasWidth : 100
        };
    }

    Init ()
    {
        this.InstallSplitter (this.parameters.navigatorSplitterDiv, this.parameters.navigatorDiv, (originalWidth, xDiff) => {
            let newWidth = originalWidth + xDiff;
            this.OnSplitterDragged (newWidth - this.navigator.GetWidth (), 0);
        });

        this.InstallSplitter (this.parameters.sidebarSplitterDiv, this.parameters.sidebarDiv, (originalWidth, xDiff) => {
            let newWidth = originalWidth - xDiff;
            this.OnSplitterDragged (0, newWidth - this.sidebar.GetWidth ());
        });

        this.Resize ();
    }

    InstallSplitter (splitterDiv, resizedDiv, onSplit)
    {
        let originalWidth = null;
        CreateVerticalSplitter (splitterDiv, {
            onSplitStart : () => {
                originalWidth = GetDomElementOuterWidth (resizedDiv);
            },
            onSplit : (xDiff) => {
                onSplit (originalWidth, xDiff);
            }
        });
    }

    OnSplitterDragged (leftDiff, rightDiff)
    {
        let windowWidth = window.innerWidth;

        let navigatorWidth = this.navigator.GetWidth ();
        let sidebarWidth = this.sidebar.GetWidth ();

        let leftWidth = GetDomElementOuterWidth (this.parameters.leftContainerDiv);
        let rightWidth = GetDomElementOuterWidth (this.parameters.rightContainerDiv);

        let newLeftWidth = leftWidth + leftDiff;
        let newRightWidth = rightWidth + rightDiff;
        let contentNewWidth = windowWidth - newLeftWidth - newRightWidth;

        let isNavigatorVisible = this.navigator.IsPanelsVisible ();
        let isSidebarVisible = this.sidebar.IsPanelsVisible ();

        if (isNavigatorVisible && newLeftWidth < this.limits.minPanelWidth) {
            newLeftWidth = this.limits.minPanelWidth;
        }

        if (isSidebarVisible && newRightWidth < this.limits.minPanelWidth) {
            newRightWidth = this.limits.minPanelWidth;
        }

        if (contentNewWidth < this.limits.minCanvasWidth) {
            if (leftDiff > 0) {
                newLeftWidth = windowWidth - newRightWidth - this.limits.minCanvasWidth;
            } else if (rightDiff > 0) {
                newRightWidth = windowWidth - newLeftWidth - this.limits.minCanvasWidth;
            }
        }

        if (isNavigatorVisible) {
            let newNavigatorWidth = navigatorWidth + (newLeftWidth - leftWidth);
            this.navigator.SetWidth (newNavigatorWidth);
        }
        if (isSidebarVisible) {
            let newSidebarWidth = sidebarWidth + (newRightWidth - rightWidth);
            this.sidebar.SetWidth (newSidebarWidth);
        }

        this.Resize ();
    }

    Resize ()
    {
        let windowWidth = window.innerWidth;
        let windowHeight = window.innerHeight;
        let headerHeight = this.parameters.headerDiv.offsetHeight;

        let leftWidth = 0;
        let rightWidth = 0;
        let safetyMargin = 0;
        if (!IsSmallWidth ()) {
            leftWidth = GetDomElementOuterWidth (this.parameters.leftContainerDiv);
            rightWidth = GetDomElementOuterWidth (this.parameters.rightContainerDiv);
            safetyMargin = 1;
        }

        let contentWidth = windowWidth - leftWidth - rightWidth;
        let contentHeight = windowHeight - headerHeight;

        if (contentWidth < this.limits.minCanvasWidth) {
            let neededIncrease = this.limits.minCanvasWidth - contentWidth;

            let isNavigatorVisible = this.navigator.IsPanelsVisible ();
            let isSidebarVisible = this.sidebar.IsPanelsVisible ();

            if (neededIncrease > 0 && isNavigatorVisible) {
                let navigatorDecrease = Math.min (neededIncrease, leftWidth - this.limits.minPanelWidth);
                this.navigator.SetWidth (this.navigator.GetWidth () - navigatorDecrease);
                neededIncrease = neededIncrease - navigatorDecrease;
            }

            if (neededIncrease > 0 && isSidebarVisible) {
                let sidebarDecrease = Math.min (neededIncrease, rightWidth - this.limits.minPanelWidth);
                this.sidebar.SetWidth (this.sidebar.GetWidth () - sidebarDecrease);
            }

            leftWidth = GetDomElementOuterWidth (this.parameters.leftContainerDiv);
            rightWidth = GetDomElementOuterWidth (this.parameters.rightContainerDiv);
            contentWidth = windowWidth - leftWidth - rightWidth;
        }

        this.navigator.Resize (contentHeight);
        SetDomElementOuterHeight (this.parameters.navigatorSplitterDiv, contentHeight);

        this.sidebar.Resize (contentHeight);
        SetDomElementOuterHeight (this.parameters.sidebarSplitterDiv, contentHeight);

        SetDomElementOuterHeight (this.parameters.introDiv, contentHeight);
        this.viewer.Resize (contentWidth - safetyMargin, contentHeight);

        let introContentHeight = GetDomElementOuterHeight (this.parameters.introContentDiv);
        let introContentTop = (contentHeight - introContentHeight) / 3.0;
        this.parameters.introContentDiv.style.top = introContentTop.toString () + 'px';

        this.measureTool.Resize ();
    }
}

export class Website
{
    constructor (parameters)
    {
        this.parameters = parameters;
        this.settings = new Settings (Theme.Light);
        this.cameraSettings = new CameraSettings ();
        this.viewer = new Viewer ();
        this.measureTool = new MeasureTool (this.viewer, this.settings, () => this.model);
        this.hashHandler = new HashHandler ();
        this.toolbar = new Toolbar (this.parameters.toolbarDiv);
        this.navigator = new Navigator (this.parameters.navigatorDiv);
        this.sidebar = new Sidebar (this.parameters.sidebarDiv, this.settings, this.cameraSettings);
        this.modelLoaderUI = new ThreeModelLoaderUI ();
        this.themeHandler = new ThemeHandler ();
        this.highlightColor = new RGBColor (142, 201, 240);
        this.uiState = WebsiteUIState.Undefined;
        this.layouter = new WebsiteLayouter (this.parameters, this.navigator, this.sidebar, this.viewer, this.measureTool);
        this.model = null;
    }

    Load ()
    {
        this.settings.LoadFromCookies ();
        this.cameraSettings.LoadFromCookies ();

        this.SwitchTheme (this.settings.themeId, false);
        HandleEvent ('theme_on_load', this.settings.themeId === Theme.Light ? 'light' : 'dark');

        EnumeratePlugins (PluginType.Header, (plugin) => {
            plugin.registerButtons ({
                createHeaderButton : (icon, title, link) => {
                    this.CreateHeaderButton (icon, title, link);
                }
            });
        });

        this.InitViewer ();
        this.InitToolbar ();
        this.InitDragAndDrop ();
        this.InitSidebar ();
        this.InitNavigator ();
        this.InitCookieConsent ();

        this.viewer.SetMouseClickHandler (this.OnModelClicked.bind (this));
        this.viewer.SetMouseMoveHandler (this.OnModelMouseMoved.bind (this));
        this.viewer.SetContextMenuHandler (this.OnModelContextMenu.bind (this));

        this.layouter.Init ();
        this.SetUIState (WebsiteUIState.Intro);

        this.hashHandler.SetEventListener (this.OnHashChange.bind (this));
        this.OnHashChange ();

        window.addEventListener ('resize', () => {
			this.layouter.Resize ();
		});
    }

    HasLoadedModel ()
    {
        return this.model !== null;
    }

    SetUIState (uiState)
    {
        function ShowOnlyOnModelElements (show)
        {
            let root = document.querySelector (':root');
            root.style.setProperty ('--ov_only_on_model_display', show ? 'inherit' : 'none');
        }

        if (this.uiState === uiState) {
            return;
        }

        this.uiState = uiState;
        if (this.uiState === WebsiteUIState.Intro) {
            ShowDomElement (this.parameters.introDiv, true);
            ShowDomElement (this.parameters.headerDiv, true);
            ShowDomElement (this.parameters.mainDiv, false);
            ShowOnlyOnModelElements (false);
        } else if (this.uiState === WebsiteUIState.Model) {
            ShowDomElement (this.parameters.introDiv, false);
            ShowDomElement (this.parameters.headerDiv, true);
            ShowDomElement (this.parameters.mainDiv, true);
            ShowOnlyOnModelElements (true);
            this.UpdatePanelsVisibility ();
        } else if (this.uiState === WebsiteUIState.Loading) {
            ShowDomElement (this.parameters.introDiv, false);
            ShowDomElement (this.parameters.headerDiv, true);
            ShowDomElement (this.parameters.mainDiv, false);
            ShowOnlyOnModelElements (false);
        }

        this.layouter.Resize ();
    }

    SwitchToModelingView ()
    {
        // Switch to model view to show the navigator with JOBS folder files
        this.SetUIState (WebsiteUIState.Model);

        // Show panels and ensure Files panel is visible
        this.navigator.ShowPanels (true);
        this.navigator.panelSet.ShowPanel (this.navigator.filesPanel);
    }

    ClearModel ()
    {
        CloseAllDialogs ();

        this.model = null;
        this.viewer.Clear ();

        this.parameters.fileNameDiv.innerHTML = '';

        this.navigator.Clear ();
        this.sidebar.Clear ();

        this.measureTool.SetActive (false);
    }

    OnModelLoaded (importResult, threeObject)
    {
        this.model = importResult.model;
        this.parameters.fileNameDiv.innerHTML = importResult.mainFile;
        this.viewer.SetMainObject (threeObject);
        this.viewer.SetUpVector (Direction.Y, false);
        this.navigator.FillTree (importResult);
        this.sidebar.UpdateControlsVisibility ();
        this.FitModelToWindow (true);
    }

    OnModelClicked (button, mouseCoordinates)
    {
        if (button !== 1) {
            return;
        }

        if (this.measureTool.IsActive ()) {
            this.measureTool.Click (mouseCoordinates);
            return;
        }

        let meshUserData = this.viewer.GetMeshUserDataUnderMouse (IntersectionMode.MeshAndLine, mouseCoordinates);
        if (meshUserData === null) {
            this.navigator.SetSelection (null);
        } else {
            this.navigator.SetSelection (new Selection (SelectionType.Mesh, meshUserData.originalMeshInstance.id));
        }
    }

    OnModelMouseMoved (mouseCoordinates)
    {
        if (this.measureTool.IsActive ()) {
            this.measureTool.MouseMove (mouseCoordinates);
        }
    }

    OnModelContextMenu (globalMouseCoordinates, mouseCoordinates)
    {
        let meshUserData = this.viewer.GetMeshUserDataUnderMouse (IntersectionMode.MeshAndLine, mouseCoordinates);
        let items = [];
        if (meshUserData === null) {
            items.push ({
                name : Loc ('Fit model to window'),
                icon : 'fit',
                onClick : () => {
                    this.FitModelToWindow (false);
                }
            });
            if (this.navigator.HasHiddenMesh ()) {
                items.push ({
                    name : Loc ('Show all parts'),
                    icon : 'visible',
                    onClick : () => {
                        this.navigator.ShowAllMeshes (true);
                    }
                });
            }
        } else {
            items.push ({
                name : Loc ('Hide part'),
                icon : 'hidden',
                onClick : () => {
                    this.navigator.ToggleMeshVisibility (meshUserData.originalMeshInstance.id);
                }
            });
            if (this.navigator.MeshItemCount () > 1) {
                let isMeshIsolated = this.navigator.IsMeshIsolated (meshUserData.originalMeshInstance.id);
                items.push ({
                    name : isMeshIsolated ? Loc ('Remove isolation') : Loc ('Isolate part'),
                    icon : isMeshIsolated ? 'deisolate' : 'isolate',
                    onClick : () => {
                        if (isMeshIsolated) {
                            this.navigator.ShowAllMeshes (true);
                        } else {
                            this.navigator.IsolateMesh (meshUserData.originalMeshInstance.id);
                        }
                    }
                });
            }

            // Add 'Hide group' button if meshUserData is present
            items.push({
                name: Loc('Hide group'),
                icon: 'hidden',
                onClick: () => {
                    // Find all mesh instances with the same group/parent node as the selected mesh
                    const selectedNode = meshUserData.originalMeshInstance.node;
                    if (selectedNode && selectedNode.parent) {
                        const groupName = selectedNode.parent.name;
                        // Hide all meshes whose parent node has the same name
                        this.model.EnumerateMeshInstances((meshInstance) => {
                            if (meshInstance.node && meshInstance.node.parent && meshInstance.node.parent.name === groupName) {
                                this.navigator.ToggleMeshVisibility(meshInstance.id, false); // false = hide
                            }
                        });
                    }
                }
            });

            // Add 'Isolate group' button if meshUserData is present
            items.push({
                name: Loc('Isolate group'),
                icon: 'isolate',
                onClick: () => {
                    // Scene batching: suppress renders during mesh visibility changes, then render once after batch
                    const selectedNode = meshUserData.originalMeshInstance.node;
                    if (selectedNode && selectedNode.parent) {
                        const groupName = selectedNode.parent.name;
                        const toShow = [];
                        const toHide = [];
                        this.viewer.BeginBatchUpdate();
                        this.model.EnumerateMeshInstances((meshInstance) => {
                            if (meshInstance.node && meshInstance.node.parent && meshInstance.node.parent.name === groupName) {
                                toShow.push(meshInstance.id);
                            } else {
                                toHide.push(meshInstance.id);
                            }
                        });
                        // Hide all not in group
                        for (const id of toHide) {
                            if (this.navigator.IsMeshVisible(id)) {
                                this.navigator.ToggleMeshVisibility(id, false, true); // suppress render
                            }
                        }
                        // Show all in group
                        for (const id of toShow) {
                            if (!this.navigator.IsMeshVisible(id)) {
                                this.navigator.ToggleMeshVisibility(id, true, true); // suppress render
                            }
                        }
                        this.viewer.EndBatchUpdate();
                    }
                }
            });

            // Move 'Fit part to window' to the end of the list
            items.push ({
                name : Loc ('Fit part to window'),
                icon : 'fit',
                onClick : () => {
                    this.navigator.FitMeshToWindow (meshUserData.originalMeshInstance.id);
                }
            });
        }
        // Sort context menu items alphabetically by name
        items.sort((a, b) => a.name.localeCompare(b.name));

        ShowListPopup (items, {
            calculatePosition : (contentDiv) => {
                return CalculatePopupPositionToScreen (globalMouseCoordinates, contentDiv);
            },
            onClick : (index) => {
                let clickedItem = items[index];
                clickedItem.onClick ();
            }
        });
    }

    OnHashChange ()
    {
        if (this.hashHandler.HasHash ()) {
            let urls = this.hashHandler.GetModelFilesFromHash ();
            if (urls === null) {
                return;
            }
            TransformFileHostUrls (urls);
            let importSettings = new ImportSettings ();
            importSettings.defaultLineColor = this.settings.defaultLineColor;
            importSettings.defaultColor = this.settings.defaultColor;
            let defaultColor = this.hashHandler.GetDefaultColorFromHash ();
            if (defaultColor !== null) {
                importSettings.defaultColor = defaultColor;
            }
            HandleEvent ('model_load_started', 'hash');
            this.LoadModelFromUrlList (urls, importSettings);
        } else {
            this.ClearModel ();
            this.SetUIState (WebsiteUIState.Intro);
        }
    }

    OpenFileBrowserDialog ()
    {
        this.parameters.fileInput.click ();
    }

    LoadJobsFile (jobsFile)
    {
        // Convert the File object to a FileList-like array
        const files = [jobsFile.file];

        // Load the model using existing method
        HandleEvent ('model_load_started', 'jobs_folder');
        this.LoadModelFromFileList (files);
    }

    FitModelToWindow (onLoad)
    {
        let animation = !onLoad;
        let boundingSphere = this.viewer.GetBoundingSphere ((meshUserData) => {
            return this.navigator.IsMeshVisible (meshUserData.originalMeshInstance.id);
        });
        if (onLoad) {
            this.viewer.AdjustClippingPlanesToSphere (boundingSphere);
        }
        this.viewer.FitSphereToWindow (boundingSphere, animation);
    }

    FitMeshToWindow (meshInstanceId)
    {
        let boundingSphere = this.viewer.GetBoundingSphere ((meshUserData) => {
            return meshUserData.originalMeshInstance.id.IsEqual (meshInstanceId);
        });
        this.viewer.FitSphereToWindow (boundingSphere, true);
    }

    FitMeshesToWindow (meshInstanceIdSet)
    {
        let meshInstanceIdKeys = new Set ();
        for (let meshInstanceId of meshInstanceIdSet) {
            meshInstanceIdKeys.add (meshInstanceId.GetKey ());
        }
        let boundingSphere = this.viewer.GetBoundingSphere ((meshUserData) => {
            return meshInstanceIdKeys.has (meshUserData.originalMeshInstance.id.GetKey ());
        });
        this.viewer.FitSphereToWindow (boundingSphere, true);
    }

    UpdateMeshesVisibility ()
    {
        this.viewer.SetMeshesVisibility ((meshUserData) => {
            // First check if the mesh/part itself is visible (navigator state)
            if (!this.navigator.IsMeshVisible (meshUserData.originalMeshInstance.id)) {
                return false;
            }

            // Then check if at least one material is visible (if material visibility is active)
            if (this.viewer._materialVisibility && this.viewer._materialVisibility.size > 0) {
                for (let matIndex of meshUserData.originalMaterials) {
                    if (this.viewer.IsMaterialVisible(matIndex)) {
                        return true;
                    }
                }
                return false;
            }

            // If no material visibility rules are active, default to visible
            return true;
        });
    }

    UpdateMeshesSelection ()
    {
        let selectedMeshId = this.navigator.GetSelectedMeshId ();
        this.viewer.SetMeshesHighlight (this.highlightColor, (meshUserData) => {
            if (selectedMeshId !== null && meshUserData.originalMeshInstance.id.IsEqual (selectedMeshId)) {
                return true;
            }
            return false;
        });
    }

    LoadModelFromUrlList (urls, settings)
    {
        let inputFiles = InputFilesFromUrls (urls);
        this.LoadModelFromInputFiles (inputFiles, settings);
        this.ClearHashIfNotOnlyUrlList ();
    }

    LoadModelFromFileList (files)
    {
        let importSettings = new ImportSettings ();
        importSettings.defaultLineColor = this.settings.defaultLineColor;
        importSettings.defaultColor = this.settings.defaultColor;
        let inputFiles = InputFilesFromFileObjects (files);
        this.LoadModelFromInputFiles (inputFiles, importSettings);
        this.ClearHashIfNotOnlyUrlList ();
    }

    LoadModelFromInputFiles (files, settings)
    {
        this.modelLoaderUI.LoadModel (files, settings, {
            onStart : () =>
            {
                this.SetUIState (WebsiteUIState.Loading);
                this.ClearModel ();
            },
            onFinish : (importResult, threeObject) =>
            {
                this.SetUIState (WebsiteUIState.Model);
                this.OnModelLoaded (importResult, threeObject);
                let importedExtension = GetFileExtension (importResult.mainFile);
                HandleEvent ('model_loaded', importedExtension);
            },
            onRender : () =>
            {
                this.viewer.Render ();
            },
            onError : (importError) =>
            {
                this.SetUIState (WebsiteUIState.Intro);
                let extensionStr = null;
                if (importError.mainFile !== null) {
                    extensionStr = GetFileExtension (importError.mainFile);
                } else {
                    let extensions = [];
                    let importer = this.modelLoaderUI.GetImporter ();
                    let fileList = importer.GetFileList ().GetFiles ();
                    for (let i = 0; i < fileList.length; i++) {
                        let extension = fileList[i].extension;
                        extensions.push (extension);
                    }
                    extensionStr = extensions.join (',');
                }
                if (importError.code === ImportErrorCode.NoImportableFile) {
                    HandleEvent ('no_importable_file', extensionStr);
                } else if (importError.code === ImportErrorCode.FailedToLoadFile) {
                    HandleEvent ('failed_to_load_file', extensionStr);
                } else if (importError.code === ImportErrorCode.ImportFailed) {
                    HandleEvent ('import_failed', extensionStr, {
                        error_message : importError.message
                    });
                }
            }
        });
    }

    ClearHashIfNotOnlyUrlList ()
    {
        let importer = this.modelLoaderUI.GetImporter ();
        let isOnlyUrl = importer.GetFileList ().IsOnlyUrlSource ();
        if (!isOnlyUrl && this.hashHandler.HasHash ()) {
            this.hashHandler.SkipNextEventHandler ();
            this.hashHandler.ClearHash ();
        }
    }

    UpdateEdgeDisplay ()
    {
        this.settings.SaveToCookies ();
        this.viewer.SetEdgeSettings (this.settings.edgeSettings);
    }

    UpdateEnvironmentMap ()
    {
    let envMapPath = '/website/assets/envmaps/' + this.settings.environmentMapName + '/';
        let envMapTextures = [
            envMapPath + 'posx.jpg',
            envMapPath + 'negx.jpg',
            envMapPath + 'posy.jpg',
            envMapPath + 'negy.jpg',
            envMapPath + 'posz.jpg',
            envMapPath + 'negz.jpg'
        ];
        let environmentSettings = new EnvironmentSettings (envMapTextures, this.settings.backgroundIsEnvMap);
        this.viewer.SetEnvironmentMapSettings (environmentSettings);
    }

    SwitchTheme (newThemeId, resetColors)
    {
        this.settings.themeId = newThemeId;
        this.themeHandler.SwitchTheme (this.settings.themeId);
        if (resetColors) {
            let defaultSettings = new Settings (this.settings.themeId);
            this.settings.backgroundColor = defaultSettings.backgroundColor;
            this.settings.defaultLineColor = defaultSettings.defaultLineColor;
            this.settings.defaultColor = defaultSettings.defaultColor;
            this.sidebar.UpdateControlsStatus ();

            this.viewer.SetBackgroundColor (this.settings.backgroundColor);
            let modelLoader = this.modelLoaderUI.GetModelLoader ();
            if (modelLoader.GetDefaultMaterials () !== null) {
                ReplaceDefaultMaterialsColor (this.model, this.settings.defaultColor, this.settings.defaultLineColor);
                modelLoader.ReplaceDefaultMaterialsColor (this.settings.defaultColor, this.settings.defaultLineColor);
            }
        }

        this.settings.SaveToCookies ();
    }

    InitViewer ()
    {
        let canvas = AddDomElement (this.parameters.viewerDiv, 'canvas');
        this.viewer.Init (canvas);
        this.viewer.SetEdgeSettings (this.settings.edgeSettings);
        this.viewer.SetBackgroundColor (this.settings.backgroundColor);
        this.viewer.SetNavigationMode (this.cameraSettings.navigationMode);
        this.viewer.SetProjectionMode (this.cameraSettings.projectionMode);
        this.viewer.SetZoomSpeed (this.cameraSettings.zoomSpeed); // Restore normal zoom speed
        this.UpdateEnvironmentMap ();

        // Add long touch support for context menu (right-click) on touch devices
        let longTouchTimer = null;
        let longTouchDuration = 500; // ms
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                longTouchTimer = setTimeout(() => {
                    // Simulate right-click/context menu at touch position
                    const touch = e.touches[0];
                    const event = new MouseEvent('contextmenu', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        clientX: touch.clientX,
                        clientY: touch.clientY,
                    });
                    canvas.dispatchEvent(event);
                }, longTouchDuration);
            }
        });
        canvas.addEventListener('touchend', () => {
            clearTimeout(longTouchTimer);
        });
        canvas.addEventListener('touchmove', () => {
            clearTimeout(longTouchTimer);
        });

        // Add double-click support for fit model to window
        canvas.addEventListener('dblclick', (e) => {
            e.preventDefault();
            this.FitModelToWindow(false);
        });
    }

    InitToolbar ()
    {
        function AddButton (toolbar, imageName, imageTitle, classNames, onClick)
        {
            let button = toolbar.AddImageButton (imageName, imageTitle, () => {
                onClick ();
            });
            for (let className of classNames) {
                button.AddClass (className);
            }
            return button;
        }

        function AddPushButton (toolbar, imageName, imageTitle, classNames, onClick)
        {
            let button;
            // Use text label for view buttons
            if (imageName === 'front_view_text') {
                button = toolbar.AddTextPushButton('FV', imageTitle, false, (isSelected) => { onClick(isSelected); });
            } else if (imageName === 'top_view_text') {
                button = toolbar.AddTextPushButton('TV', imageTitle, false, (isSelected) => { onClick(isSelected); });
            } else if (imageName === 'side_view_text') {
                button = toolbar.AddTextPushButton('SV', imageTitle, false, (isSelected) => { onClick(isSelected); });
            } else {
                button = toolbar.AddImagePushButton (imageName, imageTitle, false, (isSelected) => {
                    onClick (isSelected);
                });
            }
            for (let className of classNames) {
                button.AddClass (className);
            }
            return button;
        }

        function AddSimpleButton (toolbar, imageName, imageTitle, classNames, onClick)
        {
            let button;
            // Use text label for view buttons (non-toggle)
            if (imageName === 'front_view_text') {
                button = toolbar.AddTextButton('FV', imageTitle, () => { onClick(); });
            } else if (imageName === 'top_view_text') {
                button = toolbar.AddTextButton('TV', imageTitle, () => { onClick(); });
            } else if (imageName === 'side_view_text') {
                button = toolbar.AddTextButton('SV', imageTitle, () => { onClick(); });
            } else if (imageName === 'axo_view_text') {
                button = toolbar.AddTextButton('AV', imageTitle, () => { onClick(); });
            } else {
                button = toolbar.AddImageButton (imageName, imageTitle, () => {
                    onClick ();
                });
            }
            for (let className of classNames) {
                button.AddClass (className);
            }
            return button;
        }

        function AddRadioButton (toolbar, imageNames, imageTitles, selectedIndex, classNames, onClick)
        {
            let imageData = [];
            for (let i = 0; i < imageNames.length; i++) {
                let imageName = imageNames[i];
                let imageTitle = imageTitles[i];
                imageData.push ({
                    image : imageName,
                    title : imageTitle
                });
            }
            let buttons = toolbar.AddImageRadioButton (imageData, selectedIndex, (buttonIndex) => {
                onClick (buttonIndex);
            });
            for (let className of classNames) {
                for (let button of buttons) {
                    button.AddClass (className);
                }
            }
        }

        function AddSeparator (toolbar, classNames)
        {
            let separator = toolbar.AddSeparator ();
            if (classNames !== null) {
                for (let className of classNames) {
                    separator.classList.add (className);
                }
            }
        }

        let importer = this.modelLoaderUI.GetImporter ();
    // Set Fixed Up Vector as the standard
    this.cameraSettings.navigationMode = NavigationMode.FixedUpVector;
    let navigationModeIndex = 0;
        let projectionModeIndex = (this.cameraSettings.projectionMode === ProjectionMode.Perspective ? 0 : 1);

        AddButton (this.toolbar, 'open', Loc ('Open from your device'), [], () => {
            this.OpenFileBrowserDialog ();
        });
        AddButton (this.toolbar, 'open_url', Loc ('Open from url'), [], () => {
            ShowOpenUrlDialog ((urls) => {
                if (urls.length > 0) {
                    this.hashHandler.SetModelFilesToHash (urls);
                }
            });
        });
        AddSeparator (this.toolbar, ['only_on_model']);
        // AddButton (this.toolbar, 'expand', Loc ('Fit model to window'), ['only_on_model'], () => {
        //     this.FitModelToWindow (false);
        // });
        // Store previous camera and navigation mode
        let previousCamera = null;
        let previousNavMode = null;
        function setStandardView() {
            if (previousCamera) {
                // Restore previous camera and navigation mode
                if (this.viewer.SetCamera) {
                    this.viewer.SetCamera(previousCamera);
                }
                // Always restore Y as up vector for standard view
                if (this.viewer.SetUpVector) {
                    this.viewer.SetUpVector(Direction.Y, false);
                }
                if (this.viewer.SetNavigationMode && previousNavMode !== null) {
                    this.viewer.SetNavigationMode(previousNavMode);
                }
            }
        }

        // Mutually exclusive view buttons
        const viewButtons = {};
        function deactivateAllViewButtons(except) {
            // Simple buttons don't have toggle state, so no deactivation needed
        }

        // Front view (one-click to activate)
    viewButtons.front = AddSimpleButton(this.toolbar, 'front_view_text', Loc('Front view'), ['only_on_model'], () => {
                deactivateAllViewButtons.call(this, 'front');
                let boundingSphere = this.viewer.GetBoundingSphere(() => true);
                if (boundingSphere) {
                    let currentCamera = this.viewer.navigation.GetCamera();
                    let center = new Coord3D(boundingSphere.center.x, boundingSphere.center.y, boundingSphere.center.z);
                    let radius = boundingSphere.radius;
                    // Front view: camera rotated 90 degrees clockwise around Y-axis (for testing)
                    let angle = -90 * Math.PI / 180; // Convert to radians, negative for clockwise
                    let distance = radius * 3.0;
                    let eye = new Coord3D(
                        center.x + distance * Math.sin(angle),
                        center.y,
                        center.z - distance * Math.cos(angle)
                    );
                    console.log('Front View - Center:', center, 'Radius:', radius, 'Eye:', eye, 'Angle:', angle);
                    let up = new Coord3D(0, 1, 0);
                    let camera = new Camera(eye, center, up, currentCamera.fov);
                    console.log('Front View - New camera:', camera);
                    this.viewer.navigation.MoveCamera(camera, 30); // Use MoveCamera with 30 animation steps for even slower animation
                    console.log('Front View - Camera moved, current camera now:', this.viewer.navigation.GetCamera());
                    // Temporarily commenting out SetUpVector and SetNavigationMode to test
                    // if (this.viewer.SetUpVector) {
                    //     this.viewer.SetUpVector(Direction.Y, false);
                    //     console.log('Front View - SetUpVector called');
                    // }
                    // if (this.viewer.SetNavigationMode && this.cameraSettings) {
                    //     this.viewer.SetNavigationMode(this.cameraSettings.navigationMode);
                    //     console.log('Front View - SetNavigationMode called');
                    // }
                }
        });
        // Top view (one-click to activate)
    viewButtons.top = AddSimpleButton(this.toolbar, 'top_view_text', Loc('Top view'), ['only_on_model'], () => {
                deactivateAllViewButtons.call(this, 'top');
                let boundingSphere = this.viewer.GetBoundingSphere(() => true);
                if (boundingSphere) {
                    let currentCamera = this.viewer.navigation.GetCamera();
                    let center = new Coord3D(boundingSphere.center.x, boundingSphere.center.y, boundingSphere.center.z);
                    let radius = boundingSphere.radius;
                    // Top view: camera directly above, looking straight down along -Y axis, rotated 90 degrees clockwise
                    let distance = radius * 3.0;
                    let eye = new Coord3D(center.x, center.y + distance, center.z);
                    console.log('Top View - Center:', center, 'Radius:', radius, 'Eye:', eye);
                    // Rotate up vector 90 degrees clockwise around Y-axis for horizontal orientation
                    // Original up was (0, 0, -1), rotated 90° clockwise becomes (1, 0, 0)
                    let up = new Coord3D(1, 0, 0);  // X-axis as up for horizontal model orientation
                    let camera = new Camera(eye, center, up, currentCamera.fov);
                    console.log('Top View - New camera:', camera);
                    this.viewer.navigation.MoveCamera(camera, 30); // Use MoveCamera with 30 animation steps for even slower animation
                    console.log('Top View - Camera moved, current camera now:', this.viewer.navigation.GetCamera());
                }
        });
        // Side view (one-click to activate)
    viewButtons.side = AddSimpleButton(this.toolbar, 'side_view_text', Loc('Side view'), ['only_on_model'], () => {
                deactivateAllViewButtons.call(this, 'side');
                let boundingSphere = this.viewer.GetBoundingSphere(() => true);
                if (boundingSphere) {
                    let currentCamera = this.viewer.navigation.GetCamera();
                    let center = new Coord3D(boundingSphere.center.x, boundingSphere.center.y, boundingSphere.center.z);
                    let radius = boundingSphere.radius;
                    // Side view: camera rotated -180 degrees around Y-axis to show actual side
                    let angle = -180 * Math.PI / 180; // -180 degrees for side view
                    let distance = radius * 3.0;
                    let eye = new Coord3D(
                        center.x + distance * Math.sin(angle),
                        center.y,
                        center.z - distance * Math.cos(angle)
                    );
                    console.log('Side View - Center:', center, 'Radius:', radius, 'Eye:', eye, 'Angle:', angle);
                    let up = new Coord3D(0, 1, 0);
                    let camera = new Camera(eye, center, up, currentCamera.fov);
                    console.log('Side View - New camera:', camera);
                    this.viewer.navigation.MoveCamera(camera, 30); // Use MoveCamera with 30 animation steps for even slower animation
                    console.log('Side View - Camera moved, current camera now:', this.viewer.navigation.GetCamera());
                }
        });

        // Axo view (one-click to activate - returns to default fitted view)
    viewButtons.axo = AddSimpleButton(this.toolbar, 'axo_view_text', Loc('Axo view'), ['only_on_model'], () => {
                deactivateAllViewButtons.call(this, 'axo');
                let boundingSphere = this.viewer.GetBoundingSphere(() => true);
                if (boundingSphere) {
                    let currentCamera = this.viewer.navigation.GetCamera();
                    let center = new Coord3D(boundingSphere.center.x, boundingSphere.center.y, boundingSphere.center.z);
                    let radius = boundingSphere.radius;
                    // Upper-right-front axonometric view
                    let eye = new Coord3D(center.x + radius * 1.5, center.y + radius * 2.0, center.z + radius * 3.0);
                    let up = new Coord3D(0, 1, 0);
                    let camera = new Camera(eye, center, up, currentCamera.fov);
                    this.viewer.navigation.SetCamera(camera);
                    if (this.viewer.SetUpVector) {
                        this.viewer.SetUpVector(Direction.Y, false);
                    }
                    if (this.viewer.SetNavigationMode && this.cameraSettings) {
                        this.viewer.SetNavigationMode(this.cameraSettings.navigationMode);
                    }
                }
        });

        // Mutually exclusive up vector/flip buttons
        const upButtons = {};
        function deactivateAllUpButtons(except) {
            for (const key in upButtons) {
                if (key !== except && upButtons[key].IsSelected()) {
                    upButtons[key].SetSelected(false);
                }
            }
        }

    // --- Flip up button removed by request on 2025-09-17 ---
    /*
    upButtons.flip = AddButton(this.toolbar, 'flip', Loc('Flip up view'), ['only_on_model'], () => {
        // Toggle between front/back, side RH/LH, top/bottom infinitely
        if (!this._flipState) this._flipState = {};
        let activeView = null;
        for (const key in viewButtons) {
            if (viewButtons[key].IsSelected()) {
                activeView = key;
                break;
            }
        }
        let boundingSphere = this.viewer.GetBoundingSphere(() => true);
        if (activeView && boundingSphere) {
            let center = boundingSphere.center;
            let radius = boundingSphere.radius;
            let eye, up, fov = 45.0;
            // Track flip state per view
            if (!this._flipState[activeView]) this._flipState[activeView] = false;
            this._flipState[activeView] = !this._flipState[activeView];
            if (activeView === 'front') {
                if (this._flipState[activeView]) {
                    // Back view
                    eye = center.clone();
                    eye.x += radius * 2.5;
                } else {
                    // Front view
                    eye = center.clone();
                    eye.x -= radius * 2.5;
                }
                up = { x: 0, y: 1, z: 0 };
            } else if (activeView === 'side') {
                if (this._flipState[activeView]) {
                    // LH side
                    eye = center.clone();
                    eye.z -= radius * 2.5;
                } else {
                    // RH side
                    eye = center.clone();
                    eye.z += radius * 2.5;
                }
                up = { x: 0, y: 1, z: 0 };
            } else if (activeView === 'top') {
                if (this._flipState[activeView]) {
                    // Bottom view
                    eye = center.clone();
                    eye.y -= radius * 2.5;
                } else {
                    // Top view
                    eye = center.clone();
                    eye.y += radius * 2.5;
                }
                up = { x: 1, y: 0, z: 0 };
            }
            if (eye && up) {
                let camera = new Camera(eye, center, up, fov);
                this.viewer.SetCamera(camera);
                // Keep up vector and navigation mode as in the original view
                if (activeView === 'top') {
                    this.viewer.SetUpVector(Direction.Z, false);
                } else {
                    this.viewer.SetUpVector(Direction.Y, false);
                }
                if (this.viewer.SetNavigationMode && this.cameraSettings) {
                    this.viewer.SetNavigationMode(this.cameraSettings.navigationMode);
                }
                return;
            }
        }
        // Default flip if not in a standard view
        this.viewer.FlipUpVector();
    });
    */
        // Only one separator needed between side view and camera mode
        // AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
    // Removed Free Orbit button from the toolbar. The logic is preserved below for reference:
    /*
    AddRadioButton (this.toolbar, ['up_y', ''], [Loc ('Fixed up vector'), Loc ('Free orbit')], navigationModeIndex, ['only_full_width', 'only_on_model'], (buttonIndex) => {
        if (buttonIndex === 0) {
            this.cameraSettings.navigationMode = NavigationMode.FixedUpVector;
        } else if (buttonIndex === 1) {
            this.cameraSettings.navigationMode = NavigationMode.FreeOrbit;
        }
        this.cameraSettings.SaveToCookies ();
        this.viewer.SetNavigationMode (this.cameraSettings.navigationMode);
    });
    */
        AddRadioButton (this.toolbar, ['camera_perspective', 'camera_orthographic'], [Loc ('Perspective camera'), Loc ('Orthographic camera')], projectionModeIndex, ['only_full_width', 'only_on_model'], (buttonIndex) => {
            if (buttonIndex === 0) {
                this.cameraSettings.projectionMode = ProjectionMode.Perspective;
            } else if (buttonIndex === 1) {
                this.cameraSettings.projectionMode = ProjectionMode.Orthographic;
            }
            this.cameraSettings.SaveToCookies ();
            this.viewer.SetProjectionMode (this.cameraSettings.projectionMode);
            this.sidebar.UpdateControlsVisibility ();
        });
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        let measureToolButton = AddPushButton (this.toolbar, 'measure', Loc ('Measure'), ['only_full_width', 'only_on_model'], (isSelected) => {
            HandleEvent ('measure_tool_activated', isSelected ? 'on' : 'off');
            this.navigator.SetSelection (null);
            this.measureTool.SetActive (isSelected);
        });
        measureToolButton.buttonDiv.id = 'measure-tool-button';
        this.measureTool.SetButton (measureToolButton);
        // --- Download and Export buttons removed by request on 2025-09-17 ---
        /*
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        AddButton (this.toolbar, 'download', Loc ('Download'), ['only_full_width', 'only_on_model'], () => {
            HandleEvent ('model_downloaded', '');
            let importer = this.modelLoaderUI.GetImporter ();
            DownloadModel (importer);
        });
        AddButton (this.toolbar, 'export', Loc ('Export'), ['only_full_width', 'only_on_model'], () => {
            ShowExportDialog (this.model, this.viewer, {
                isMeshVisible : (meshInstanceId) => {
                    return this.navigator.IsMeshVisible (meshInstanceId);
                }
            });
        });
        */
        // ---------------------------------------------------------------
        AddButton (this.toolbar, 'snapshot', Loc ('Create snapshot'), ['only_full_width', 'only_on_model'], () => {
            ShowSnapshotDialog (this.viewer);
        });
        AddButton (this.toolbar, 'share', Loc ('Share'), ['only_full_width', 'only_on_model'], () => {
            ShowSharingDialog (importer.GetFileList (), this.settings, this.viewer);
        });
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);

        EnumeratePlugins (PluginType.Toolbar, (plugin) => {
            plugin.registerButtons ({
                createSeparator : (classNames) => {
                    AddSeparator (this.toolbar, classNames);
                },
                createButton : (icon, title, classNames, onClick) => {
                    AddButton (this.toolbar, icon, title, classNames, onClick);
                },
                getModel : () => {
                    return this.model;
                }
            });
        });

        let selectedTheme = (this.settings.themeId === Theme.Light ? 1 : 0);
        AddRadioButton (this.toolbar, ['dark_mode', 'light_mode'], [Loc ('Dark mode'), Loc ('Light mode')], selectedTheme, ['align_right'], (buttonIndex) => {
            if (buttonIndex === 0) {
                this.settings.themeId = Theme.Dark;
            } else if (buttonIndex === 1) {
                this.settings.themeId = Theme.Light;
            }
            HandleEvent ('theme_changed', this.settings.themeId === Theme.Light ? 'light' : 'dark');
            this.SwitchTheme (this.settings.themeId, true);
        });

        this.parameters.fileInput.addEventListener ('change', (ev) => {
            if (ev.target.files.length > 0) {
                HandleEvent ('model_load_started', 'open_file');
                this.LoadModelFromFileList (ev.target.files);
            }
        });
    }

    InitDragAndDrop ()
    {
        window.addEventListener ('dragstart', (ev) => {
            ev.preventDefault ();
        }, false);

        window.addEventListener ('dragover', (ev) => {
            ev.stopPropagation ();
            ev.preventDefault ();
            ev.dataTransfer.dropEffect = 'copy';
        }, false);

        window.addEventListener ('drop', (ev) => {
            ev.stopPropagation ();
            ev.preventDefault ();
            GetFilesFromDataTransfer (ev.dataTransfer, (files) => {
                if (files.length > 0) {
                    HandleEvent ('model_load_started', 'drop');
                    this.LoadModelFromFileList (files);
                }
            });
        }, false);
    }

    InitSidebar ()
    {
        this.sidebar.Init ({
            getShadingType : () => {
                return this.viewer.GetShadingType ();
            },
            getProjectionMode : () => {
                return this.viewer.GetProjectionMode ();
            },
            getDefaultMaterials : () => {
                return GetDefaultMaterials (this.model);
            },
            onEnvironmentMapChanged : () => {
                this.settings.SaveToCookies ();
                this.UpdateEnvironmentMap ();
                if (this.measureTool.IsActive ()) {
                    this.measureTool.UpdatePanel ();
                }
            },
            onBackgroundColorChanged : () => {
                this.settings.SaveToCookies ();
                this.viewer.SetBackgroundColor (this.settings.backgroundColor);
                if (this.measureTool.IsActive ()) {
                    this.measureTool.UpdatePanel ();
                }
            },
            onDefaultColorChanged : () => {
                this.settings.SaveToCookies ();
                let modelLoader = this.modelLoaderUI.GetModelLoader ();
                if (modelLoader.GetDefaultMaterials () !== null) {
                    ReplaceDefaultMaterialsColor (this.model, this.settings.defaultColor, this.settings.defaultLineColor);
                    modelLoader.ReplaceDefaultMaterialsColor (this.settings.defaultColor, this.settings.defaultLineColor);
                }
                this.viewer.Render ();
            },
            onEdgeDisplayChanged : () => {
                HandleEvent ('edge_display_changed', this.settings.showEdges ? 'on' : 'off');
                this.UpdateEdgeDisplay ();
            },
            onUnitSettingsChanged : () => {
                this.settings.SaveToCookies ();
                // Update the measurement tool panel if it's active
                if (this.measureTool.IsActive ()) {
                    this.measureTool.UpdatePanel ();
                }
                // Update the details panel if it's showing
                this.sidebar.UpdateControlsStatus ();
            },
            onZoomSpeedChanged : () => {
                console.log('Website zoom speed callback triggered, new speed:', this.cameraSettings.zoomSpeed); // Debug log
                this.cameraSettings.SaveToCookies ();
                this.viewer.SetZoomSpeed (this.cameraSettings.zoomSpeed); // Restore normal zoom speed
            },
            onResizeRequested : () => {
                this.layouter.Resize ();
            },
            onShowHidePanels : (show) => {
                ShowDomElement (this.parameters.sidebarSplitterDiv, show);
                CookieSetBoolVal ('ov_show_sidebar', show);
            }
        });
    }

    InitNavigator ()
    {
        function GetMeshUserDataArray (viewer, meshInstanceId)
        {
            let userDataArr = [];
            viewer.EnumerateMeshesAndLinesUserData ((meshUserData) => {
                if (meshUserData.originalMeshInstance.id.IsEqual (meshInstanceId)) {
                    userDataArr.push (meshUserData);
                }
            });
            return userDataArr;
        }

        function GetMeshesForMaterial (viewer, materialIndex)
        {
            let usedByMeshes = [];
            viewer.EnumerateMeshesAndLinesUserData ((meshUserData) => {
                if (materialIndex === null || meshUserData.originalMaterials.indexOf (materialIndex) !== -1) {
                    usedByMeshes.push (meshUserData.originalMeshInstance);
                }
            });
            return usedByMeshes;
        }

        function GetMaterialsFromVisibleMeshes (navigator, viewer, model)
        {
            let visibleMaterials = new Set ();
            viewer.EnumerateMeshesAndLinesUserData ((meshUserData) => {
                // Check if this mesh is visible in the navigator
                if (navigator.IsMeshVisible (meshUserData.originalMeshInstance.id)) {
                    // Add all materials used by this visible mesh
                    if (meshUserData.originalMaterials) {
                        for (let materialIndex of meshUserData.originalMaterials) {
                            visibleMaterials.add (materialIndex);
                        }
                    }
                }
            });
            return Array.from (visibleMaterials);
        }

        function GetMaterialReferenceInfo (model, materialIndex)
        {
            const material = model.GetMaterial (materialIndex);
            return {
                index : materialIndex,
                name : material.name,
                color : material.color.Clone ()
            };
        }

        function GetMaterialsForMesh (viewer, model, meshInstanceId)
        {
            let usedMaterials = [];
            if (meshInstanceId === null) {
                for (let materialIndex = 0; materialIndex < model.MaterialCount (); materialIndex++) {
                    usedMaterials.push (GetMaterialReferenceInfo (model, materialIndex));
                }
            } else {
                let userDataArr = GetMeshUserDataArray (viewer, meshInstanceId);
                let addedMaterialIndices = new Set ();
                for (let userData of userDataArr) {
                    for (let materialIndex of userData.originalMaterials) {
                        if (addedMaterialIndices.has (materialIndex)) {
                            continue;
                        }
                        usedMaterials.push (GetMaterialReferenceInfo (model, materialIndex));
                        addedMaterialIndices.add (materialIndex);
                    }
                }
            }
            usedMaterials.sort ((a, b) => {
                return a.index - b.index;
            });
            return usedMaterials;
        }

        this.navigator.Init ({
            openFileBrowserDialog : () => {
                this.OpenFileBrowserDialog ();
            },
            onJobsFileSelected : (jobsFile) => {
                this.LoadJobsFile (jobsFile);
            },
            onJobsFolderLoaded : () => {
                this.SwitchToModelingView ();
            },
            onJobsFolderCleared : () => {
                this.SetUIState (WebsiteUIState.Intro);
            },
            fitMeshToWindow : (meshInstanceId) => {
                this.FitMeshToWindow (meshInstanceId);
            },
            fitMeshesToWindow : (meshInstanceIdSet) => {
                this.FitMeshesToWindow (meshInstanceIdSet);
            },
            getMeshesForMaterial : (materialIndex) => {
                return GetMeshesForMaterial (this.viewer, materialIndex);
            },
            getMaterialsForMesh : (meshInstanceId) => {
                return GetMaterialsForMesh (this.viewer, this.model, meshInstanceId);
            },
            getMaterialsFromVisibleMeshes : () => {
                return GetMaterialsFromVisibleMeshes (this.navigator, this.viewer, this.model);
            },
            onMeshVisibilityChanged : () => {
                this.UpdateMeshesVisibility ();
                this.navigator.RefreshMaterialsPanel ();
            },
            onMaterialVisibilityChanged : (materialIndex) => {
                this.viewer.SetMaterialVisible (materialIndex, !this.viewer.IsMaterialVisible (materialIndex));
                this.UpdateMeshesVisibility ();
            },
            onResetMaterialVisibility : () => {
                this.viewer.ResetMaterialVisibility ();
                this.navigator.ResetMaterialsVisibility ();
                this.navigator.RefreshMaterialsPanel ();
            },
            onMeshSelectionChanged : () => {
                this.UpdateMeshesSelection ();
            },
            onSelectionCleared : () => {
                this.sidebar.AddObject3DProperties (this.model, this.model);
            },
            onMeshSelected : (meshInstanceId) => {
                console.log('onMeshSelected called', meshInstanceId);
                let meshInstance = this.model.GetMeshInstance(meshInstanceId);
                console.log('meshInstance:', meshInstance);
                this.sidebar.AddObject3DProperties (this.model, meshInstance);
            },
            onMaterialSelected : (materialIndex) => {
                this.sidebar.AddMaterialProperties (this.model.GetMaterial (materialIndex));
            },
            onMaterialShowHide : (materialIndex) => {
                this.viewer.SetMaterialVisible (materialIndex, !this.viewer.IsMaterialVisible (materialIndex));
            },
            onResizeRequested : () => {
                this.layouter.Resize ();
            },
            onShowHidePanels : (show) => {
                ShowDomElement (this.parameters.navigatorSplitterDiv, show);
                CookieSetBoolVal ('ov_show_navigator', show);
            }
        });
    }

    UpdatePanelsVisibility ()
    {
        let showNavigator = CookieGetBoolVal ('ov_show_navigator', true);
        let showSidebar = CookieGetBoolVal ('ov_show_sidebar', true);
        this.navigator.ShowPanels (showNavigator);
        this.sidebar.ShowPanels (showSidebar);
    }

    CreateHeaderButton (icon, title, link)
    {
        let buttonLink = CreateDomElement ('a');
        buttonLink.setAttribute ('href', link);
        buttonLink.setAttribute ('target', '_blank');
        buttonLink.setAttribute ('rel', 'noopener noreferrer');
        InstallTooltip (buttonLink, title);
        AddSvgIconElement (buttonLink, icon, 'header_button');
        this.parameters.headerButtonsDiv.appendChild (buttonLink);
        return buttonLink;
    }

    InitCookieConsent ()
    {
        let accepted = CookieGetBoolVal ('ov_cookie_consent', false);
        if (accepted) {
            return;
        }

        let text = Loc ('This website uses cookies to offer you better user experience. See the details at the <a target="_blank" href="info/cookies.html">Cookies Policy</a> page.');
        let popupDiv = AddDiv (document.body, 'ov_bottom_floating_panel');
        AddDiv (popupDiv, 'ov_floating_panel_text', text);
        let acceptButton = AddDiv (popupDiv, 'ov_button ov_floating_panel_button', Loc ('Accept'));
        acceptButton.addEventListener ('click', () => {
            CookieSetBoolVal ('ov_cookie_consent', true);
            popupDiv.remove ();
        });
    }
}

// --- Slicer UI Overlay ---
function initSlicerUI() {
    window.slicerState = {
        enabled: true,
        invert: false,
        value: 0
    };
    // Create overlay div
    const slicerDiv = document.createElement('div');
    slicerDiv.style.position = 'absolute';
    slicerDiv.style.left = '50%';
    slicerDiv.style.bottom = '32px';
    slicerDiv.style.transform = 'translateX(-50%)';
    slicerDiv.style.background = 'rgba(32,32,32,0.85)';
    slicerDiv.style.padding = '12px 24px';
    slicerDiv.style.borderRadius = '8px';
    slicerDiv.style.zIndex = '1000';
    slicerDiv.style.display = 'flex';
    slicerDiv.style.alignItems = 'center';
    slicerDiv.style.gap = '12px';
    slicerDiv.setAttribute('aria-label', 'Model Slicer');

    // Minimalist Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'On';
    toggleBtn.setAttribute('aria-label', 'Toggle slicer');
    toggleBtn.style.borderRadius = '14px';
    toggleBtn.style.padding = '4px 12px';
    toggleBtn.style.border = 'none';
    toggleBtn.style.background = '#222';
    toggleBtn.style.color = '#fff';
    toggleBtn.style.fontWeight = 'bold';
    toggleBtn.style.fontSize = '13px';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.disabled = true;

    // Minimalist Flip button
    const flipBtn = document.createElement('button');
    flipBtn.textContent = 'Flip';
    flipBtn.setAttribute('aria-label', 'Flip slicing direction');
    flipBtn.style.borderRadius = '14px';
    flipBtn.style.padding = '4px 12px';
    flipBtn.style.border = 'none';
    flipBtn.style.background = '#222';
    flipBtn.style.color = '#fff';
    flipBtn.style.fontWeight = 'bold';
    flipBtn.style.fontSize = '13px';
    flipBtn.style.cursor = 'pointer';
    flipBtn.disabled = true;

    // Minimalist slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = '0';
    slider.setAttribute('aria-label', 'Slicer progress');
    slider.style.width = '120px';
    slider.style.height = '4px';
    slider.style.background = '#444';
    slider.disabled = true;
    window.slicerSlider = slider;

    // --- Slicer Logic ---
    function getViewer() {
        if (window.website && window.website.viewer) {
            return window.website.viewer;
        }
        return null;
    }
    let clippingPlane = null;
    function updateClippingPlane() {
        const viewer = getViewer();
        console.log('updateClippingPlane called', viewer);
        if (!viewer || !viewer.camera) return;
        if (!window.slicerState.enabled) {
            viewer.renderer.localClippingEnabled = false;
            viewer.renderer.clippingPlanes = [];
            // Disable clipping on all materials
            if (viewer.mainModel && viewer.mainModel.threeObject) {
                viewer.mainModel.threeObject.traverse(obj => {
                    if (obj.isMesh && obj.material) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach(mat => {
                            mat.clipShadows = false;
                            mat.clippingPlanes = null;
                            mat.needsUpdate = true;
                        });
                    }
                });
            }
            viewer.Render && viewer.Render();
            return;
        }
        // We'll compute a clipping plane and assign it to renderer and materials
        // Get camera direction
        const cam = viewer.camera;
        const camDir = new THREE.Vector3();
        cam.getWorldDirection(camDir);
        if (window.slicerState.invert) camDir.negate();
        // Get bounding box and compute min/max projection along camera axis using all 8 corners
        const bbox = viewer.GetBoundingBox(() => true);
        console.log('Bounding box:', bbox);
        if (!bbox) return;
        const min = bbox.min;
        const max = bbox.max;
        const corners = [
            new THREE.Vector3(min.x, min.y, min.z),
            new THREE.Vector3(min.x, min.y, max.z),
            new THREE.Vector3(min.x, max.y, min.z),
            new THREE.Vector3(min.x, max.y, max.z),
            new THREE.Vector3(max.x, min.y, min.z),
            new THREE.Vector3(max.x, min.y, max.z),
            new THREE.Vector3(max.x, max.y, min.z),
            new THREE.Vector3(max.x, max.y, max.z)
        ];
        let minProj = Number.POSITIVE_INFINITY;
        let maxProj = Number.NEGATIVE_INFINITY;
        corners.forEach(c => {
            const p = c.dot(camDir);
            if (p < minProj) minProj = p;
            if (p > maxProj) maxProj = p;
        });
        // Interpolate along camera axis
        const t = window.slicerState.value; // [0..1]
        const planeDist = minProj + t * (maxProj - minProj);
        // Offset by world origin
        const center = new THREE.Vector3(
            (min.x + max.x) / 2,
            (min.y + max.y) / 2,
            (min.z + max.z) / 2
        );
        const centerProj = center.dot(camDir);
        const origin = center.clone().add(camDir.clone().multiplyScalar(planeDist - centerProj));
        // Create/update plane
        clippingPlane = new THREE.Plane();
        clippingPlane.setFromNormalAndCoplanarPoint(camDir, origin);
        viewer.renderer.localClippingEnabled = true;
        viewer.renderer.clippingPlanes = [clippingPlane];

        // Assign clipping plane to materials so shader uniforms get updated and force update
        if (viewer.mainModel && viewer.mainModel.threeObject) {
            viewer.mainModel.threeObject.traverse(obj => {
                if (obj.isMesh && obj.material) {
                    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                    mats.forEach(mat => {
                        mat.clippingPlanes = [clippingPlane];
                        mat.clipShadows = true;
                        mat.needsUpdate = true;
                    });
                }
            });
        }

        // Trigger a render so the change is visible immediately
        viewer.Render && viewer.Render();
        console.log('Clipping plane updated:', clippingPlane);
    }

    // Ensure slicer updates after model load
    if (window.website) {
        const origOnModelLoaded = window.website.OnModelLoaded;
        window.website.OnModelLoaded = function(importResult, threeObject) {
            if (origOnModelLoaded) origOnModelLoaded.call(this, importResult, threeObject);
            // Enable slicer controls when a model is loaded
            toggleBtn.disabled = false;
            flipBtn.disabled = false;
            slider.disabled = false;
            setTimeout(updateClippingPlane, 100);
        };
    }

    toggleBtn.onclick = () => {
        window.slicerState.enabled = !window.slicerState.enabled;
        toggleBtn.textContent = window.slicerState.enabled ? 'On' : 'Off';
        updateClippingPlane();
    };
    flipBtn.onclick = () => {
        window.slicerState.invert = !window.slicerState.invert;
        updateClippingPlane();
    };
    slider.oninput = () => {
        window.slicerState.value = parseInt(slider.value) / 100;
        updateClippingPlane();
    };
    slider.onkeydown = (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            slider.value = Math.max(0, parseInt(slider.value) - 1);
            window.slicerState.value = parseInt(slider.value) / 100;
            updateClippingPlane();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            slider.value = Math.min(100, parseInt(slider.value) + 1);
            window.slicerState.value = parseInt(slider.value) / 100;
            updateClippingPlane();
        }
    };

    // slicerDiv.appendChild(toggleBtn);  // Hidden by request
    // slicerDiv.appendChild(flipBtn);    // Hidden by request
    slicerDiv.appendChild(slider);
    slicerDiv.style.display = 'flex'; // Always visible
    document.body.appendChild(slicerDiv);
}

function waitForWebsiteAndInitSlicer() {
    if (window.website && window.website.viewer) {
        initSlicerUI();
    } else {
        setTimeout(waitForWebsiteAndInitSlicer, 100);
    }
}

window.addEventListener('load', waitForWebsiteAndInitSlicer);
