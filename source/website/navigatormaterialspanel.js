import { AddDiv, SetDomElementHeight, GetDomElementOuterHeight } from '../engine/viewer/domutils.js';
import { CalculatePopupPositionToElementBottomRight, ShowListPopup } from './dialogs.js';
import { MaterialItem } from './navigatoritems.js';
import { NavigatorPanel, NavigatorPopupButton } from './navigatorpanel.js';
import { GetMaterialName, GetMeshName } from './utils.js';
import { AddSvgIconElement, SetSvgIconImageElement } from './utils.js';
import { Loc, FLoc } from '../engine/core/localization.js';

class NavigatorMeshesPopupButton extends NavigatorPopupButton
{
    constructor (parentDiv)
    {
        super (parentDiv);
        this.meshInstanceArray = null;
    }

    Update (meshInstanceArray)
    {
        this.meshInstanceArray = meshInstanceArray;
        if (this.meshInstanceArray === null) {
            return;
        }

    let partsText = FLoc ('Parts ({0})', this.meshInstanceArray.length);
    this.buttonText.innerHTML = partsText;
    }

    OnButtonClick ()
    {
        if (this.meshInstanceArray === null) {
            return;
        }

        let meshItems = [];
        for (let i = 0; i < this.meshInstanceArray.length; i++) {
            let meshInstance = this.meshInstanceArray[i];
            meshItems.push ({
                name : GetMeshName (meshInstance.node.GetName (), meshInstance.mesh.GetName ())
            });
        }

        if (meshItems.length === 0) {
            return;
        }

        this.popup = ShowListPopup (meshItems, {
            calculatePosition : (contentDiv) => {
                return CalculatePopupPositionToElementBottomRight (this.button, contentDiv);
            },
            onHoverStart : (index) => {
                const meshInstance = this.meshInstanceArray[index];
                this.callbacks.onMeshHover (meshInstance.id);
            },
            onHoverStop : (index) => {
                this.callbacks.onMeshHover (null);
            },
            onClick : (index) => {
                const meshInstance = this.meshInstanceArray[index];
                this.callbacks.onMeshSelected (meshInstance.id);
            }
        });
    }
}

export class NavigatorMaterialsPanel extends NavigatorPanel
{
    constructor (parentDiv)
    {
        super (parentDiv);
        this.callbacks = null;
        this.materialIndexToItem = new Map ();

        this.titleButtonsDiv = AddDiv (this.titleDiv, 'ov_navigator_tree_title_buttons');
        this.popupDiv = AddDiv (this.panelDiv, 'ov_navigator_info_panel');
        this.meshesButton = new NavigatorMeshesPopupButton (this.popupDiv);

        // Create show/hide all materials button
        this.showHideAllButton = AddDiv (this.titleButtonsDiv, 'ov_navigator_button right');
        this.showHideAllButton.setAttribute ('alt', Loc ('Show/hide all materials'));
        this.showHideAllButton.setAttribute ('title', Loc ('Show/hide all materials'));
        this.showHideAllIconDiv = AddSvgIconElement (this.showHideAllButton, 'visible');
        this.allMaterialsVisible = true;
        this.showHideAllButton.addEventListener ('click', () => {
            this.ToggleAllMaterials ();
        });
    }

    GetName ()
    {
        return Loc ('Materials');
    }

    GetIcon ()
    {
        return 'materials';
    }

    Resize ()
    {
        let titleHeight = GetDomElementOuterHeight (this.titleDiv);
        let popupHeight = GetDomElementOuterHeight (this.popupDiv);
        let height = this.parentDiv.offsetHeight;
        SetDomElementHeight (this.treeDiv, height - titleHeight - popupHeight);
    }

    Clear ()
    {
        super.Clear ();
        this.meshesButton.Clear ();
        this.materialIndexToItem = new Map ();
    }

    Init (callbacks)
    {
        super.Init (callbacks);
        this.meshesButton.Init ({
            onMeshHover : (meshInstanceId) => {
                this.callbacks.onMeshTemporarySelected (meshInstanceId);
            },
            onMeshSelected : (meshInstanceId) => {
                this.callbacks.onMeshSelected (meshInstanceId);
            }
        });
    }

    Fill (importResult)
    {
        super.Fill (importResult);
        this.FillMaterials (importResult);
    }

    FillMaterials (importResult, visibleMaterialsOnly = false)
    {
        // Clear existing materials
        this.materialIndexToItem.clear ();
        this.treeView.Clear ();

        const model = importResult.model;
        let materialIndices = [];

        if (visibleMaterialsOnly && this.callbacks && this.callbacks.getMaterialsFromVisibleMeshes) {
            materialIndices = this.callbacks.getMaterialsFromVisibleMeshes ();
        } else {
            // Show all materials
            for (let materialIndex = 0; materialIndex < model.MaterialCount (); materialIndex++) {
                materialIndices.push (materialIndex);
            }
        }

        // Create material items
        for (let materialIndex of materialIndices) {
            let material = model.GetMaterial (materialIndex);
            let materialName = GetMaterialName (material.name);
            let materialItem = new MaterialItem (materialName, materialIndex, {
                onSelected : (materialIndex) => {
                    this.callbacks.onMaterialSelected (materialIndex);
                },
                onShowHide : (materialIndex) => {
                    this.callbacks.onMaterialShowHide (materialIndex);
                }
            });
            this.materialIndexToItem.set (materialIndex, materialItem);
            this.treeView.AddChild (materialItem);
        }

        // Update the show/hide all button state
        this.UpdateShowHideAllButton ();
    }

    RefreshVisibleMaterials (importResult)
    {
        this.FillMaterials (importResult, true);
    }

    GetMaterialItem (materialIndex)
    {
        return this.materialIndexToItem.get (materialIndex);
    }

    SelectMaterialItem (materialIndex, isSelected)
    {
        this.GetMaterialItem (materialIndex).SetSelected (isSelected);
    }

    ToggleMaterialVisibility (materialIndex)
    {
        let materialItem = this.GetMaterialItem (materialIndex);
        if (materialItem) {
            materialItem.SetVisible (!materialItem.IsVisible ());
            // Update the show/hide all button state when individual materials are toggled
            this.UpdateShowHideAllButton ();
        }
    }

    ToggleAllMaterials ()
    {
        // Check actual state of materials to determine action
        const currentlyAllVisible = this.AreAllMaterialsVisible();
        const newVisibilityState = !currentlyAllVisible;

        this.ShowAllMaterials (newVisibilityState);
        this.allMaterialsVisible = newVisibilityState;
        this.UpdateShowHideAllButton ();
    }    ShowAllMaterials (show)
    {
        this.materialIndexToItem.forEach ((materialItem, materialIndex) => {
            // Only trigger callback if the state is actually changing
            if (materialItem.IsVisible() !== show) {
                if (this.callbacks && this.callbacks.onMaterialShowHide) {
                    this.callbacks.onMaterialShowHide (materialIndex);
                }
            }
        });
    }

    AreAllMaterialsVisible ()
    {
        // Check if all materials are currently visible
        if (this.materialIndexToItem.size === 0) {
            return true; // No materials to check, consider "all visible"
        }

        for (let [materialIndex, materialItem] of this.materialIndexToItem) {
            if (!materialItem.IsVisible()) {
                return false;
            }
        }
        return true;
    }

    UpdateShowHideAllButton ()
    {
        // Check actual state instead of relying on the flag
        const allVisible = this.AreAllMaterialsVisible();
        if (allVisible) {
            SetSvgIconImageElement (this.showHideAllIconDiv, 'visible');
        } else {
            SetSvgIconImageElement (this.showHideAllIconDiv, 'hidden');
        }
        this.allMaterialsVisible = allVisible;
    }

    ResetAllMaterialsVisibility ()
    {
        // Reset all material items to visible
        this.materialIndexToItem.forEach ((materialItem) => {
            materialItem.SetVisible (true);
        });
        // Reset the show/hide all button to visible state
        this.allMaterialsVisible = true;
        this.UpdateShowHideAllButton ();
    }

    UpdateMeshList (meshInstanceArray)
    {
        this.meshesButton.Update (meshInstanceArray);
    }
}
