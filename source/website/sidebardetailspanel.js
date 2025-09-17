import { RunTaskAsync } from '../engine/core/taskrunner.js';
import { SubCoord3D } from '../engine/geometry/coord3d.js';
import { GetBoundingBox, IsTwoManifold } from '../engine/model/modelutils.js';
import { CalculateVolume, CalculateSurfaceArea } from '../engine/model/quantities.js';
import { Property, PropertyToString, PropertyType } from '../engine/model/property.js';
import { AddDiv, AddDomElement, ClearDomElement } from '../engine/viewer/domutils.js';
import { SidebarPanel } from './sidebarpanel.js';
import { CreateInlineColorCircle } from './utils.js';
import { GetFileName, IsUrl } from '../engine/io/fileutils.js';
import { MaterialSource, MaterialType } from '../engine/model/material.js';
import { RGBColorToHexString } from '../engine/model/color.js';
import { Unit } from '../engine/model/unit.js';
import { Loc } from '../engine/core/localization.js';

function UnitToString (unit)
{
    switch (unit) {
        case Unit.Millimeter:
            return Loc ('Millimeter');
        case Unit.Centimeter:
            return Loc ('Centimeter');
        case Unit.Meter:
            return Loc ('Meter');
        case Unit.Inch:
            return Loc ('Inch');
        case Unit.Foot:
            return Loc ('Foot');
    }
    return Loc ('Unknown');
}

export class SidebarDetailsPanel extends SidebarPanel
{
    constructor (parentDiv, settings)
    {
        super (parentDiv);
        this.settings = settings;
    }

    GetName ()
    {
        return Loc ('Details');
    }

    GetIcon ()
    {
        return 'details';
    }

    AddObject3DProperties (model, object3D)
    {
        // DEBUG: Log entry to AddObject3DProperties
        console.log('AddObject3DProperties called', model, object3D);

        this.Clear ();
        let table = AddDiv (this.contentDiv, 'ov_property_table');
        // Add part name
        if (typeof object3D.GetName === 'function') {
            const partName = object3D.GetName();
            if (partName && partName.length > 0) {
                // DEBUG: Log the part name and object3D before adding property
                console.log('Part name for details panel:', partName, object3D);
                this.AddProperty(table, new Property(PropertyType.Text, Loc('Name'), partName));
            }
        }
        let boundingBox = GetBoundingBox (object3D);
        let size = SubCoord3D (boundingBox.max, boundingBox.min);
        let unit = model.GetUnit ();

        // Apply unit conversion with scale factor
        const toDisplayUnits = (val) => {
            let convertedValue = val;
            // First convert from model units to mm
            if (unit === Unit.Meter) {
                convertedValue = val * 1000.0;
            } else if (unit === Unit.Centimeter) {
                convertedValue = val * 10.0;
            }
            // Then apply user scale factor
            if (this.settings && this.settings.unitScaleFactor) {
                convertedValue *= this.settings.unitScaleFactor;
            }
            return convertedValue;
        };

        const toDisplayUnits3 = (val) => {
            let convertedValue = val;
            // First convert from model units to mm³
            if (unit === Unit.Meter) {
                convertedValue = val * 1e9;
            } else if (unit === Unit.Centimeter) {
                convertedValue = val * 1e3;
            }
            // Then apply user scale factor cubed for volume
            if (this.settings && this.settings.unitScaleFactor) {
                convertedValue *= Math.pow(this.settings.unitScaleFactor, 3);
            }
            return convertedValue;
        };

        // Get unit name for display
        let unitName = (this.settings && this.settings.unitName) ? this.settings.unitName : 'mm';

   // Display Group and Part name from node
        if (object3D && object3D.node) {
            // Part name: node.name
            // Group: node.parent.name (if exists)
            const partName = object3D.node.name || '';
            let groupName = '';
            if (object3D.node.parent && object3D.node.parent.name) {
                groupName = object3D.node.parent.name;
            }
            if (groupName) {
                this.AddProperty(table, new Property(PropertyType.Text, '<b>' + Loc('Group') + ':</b>', groupName));
            }
            if (partName) {
                this.AddProperty(table, new Property(PropertyType.Text, '<b>' + Loc('Part name') + ':</b>', partName));
            }

            // Add material name if this is a mesh instance
            if (object3D && object3D.mesh && object3D.GetId) {
                const materialNames = this.GetMaterialNamesForMeshInstance(model, object3D);
                if (materialNames.length > 0) {
                    const materialText = materialNames.join(', ');
                    this.AddProperty(table, new Property(PropertyType.Text, '<b>' + Loc('Material') + ':</b>', materialText));
                }
                // Add a blank row for spacing
                AddDiv(table, 'ov_property_table_row', '\u00A0');
            } else if (partName) {
                // Add a blank row for spacing only if we had a part name but no material info
                AddDiv(table, 'ov_property_table_row', '\u00A0');
            }
        }

   // Display Dimensions

    // Sort and label dimensions as Length (largest), Thickness (smallest), Width (remaining)
    let dims = [toDisplayUnits(size.x), toDisplayUnits(size.y), toDisplayUnits(size.z)];
    let sorted = [...dims].sort((a, b) => a - b);
    let thickness = sorted[0];
    let width = sorted[1];
    let length = sorted[2];
    // Map original dims to labels with unit suffix
    this.AddProperty(table, new Property(PropertyType.Text, Loc('Length'), length.toFixed(2) + ' ' + unitName));
    this.AddProperty(table, new Property(PropertyType.Text, Loc('Width'), width.toFixed(2) + ' ' + unitName));
    this.AddProperty(table, new Property(PropertyType.Text, Loc('Thickness'), thickness.toFixed(2) + ' ' + unitName));




        if (object3D.PropertyGroupCount () > 0) {
            let customTable = AddDiv (this.contentDiv, 'ov_property_table ov_property_table_custom');
            for (let i = 0; i < object3D.PropertyGroupCount (); i++) {
                const propertyGroup = object3D.GetPropertyGroup (i);
                this.AddPropertyGroup (customTable, propertyGroup);
                for (let j = 0; j < propertyGroup.PropertyCount (); j++) {
                    const property = propertyGroup.GetProperty (j);
                    this.AddPropertyInGroup (customTable, property);
                }
            }
        }
        this.Resize ();
    }

    GetMaterialNamesForMeshInstance (model, meshInstance)
    {
        let materialNames = [];
        if (meshInstance && meshInstance.mesh) {
            // Get unique material indices used by this mesh
            let materialIndices = new Set();
            const mesh = meshInstance.mesh;

            // Iterate through triangles to collect material indices
            for (let i = 0; i < mesh.TriangleCount(); i++) {
                const triangle = mesh.GetTriangle(i);
                if (triangle.mat !== null && triangle.mat !== undefined) {
                    materialIndices.add(triangle.mat);
                }
            }

            // Convert material indices to material names
            for (let materialIndex of materialIndices) {
                if (materialIndex < model.MaterialCount()) {
                    const material = model.GetMaterial(materialIndex);
                    const materialName = material.name || `Material ${materialIndex}`;
                    materialNames.push(materialName);
                }
            }
        }
        return materialNames.sort();
    }

    AddMaterialProperties (material)
    {
        function AddTextureMap (obj, table, name, map)
        {
            if (map === null || map.name === null) {
                return;
            }
            let fileName = GetFileName (map.name);
            obj.AddProperty (table, new Property (PropertyType.Text, name, fileName));
        }

        this.Clear ();
        let table = AddDiv (this.contentDiv, 'ov_property_table');
        let typeString = null;
        if (material.type === MaterialType.Phong) {
            typeString = Loc ('Phong');
        } else if (material.type === MaterialType.Physical) {
            typeString = Loc ('Physical');
        }
        let materialSource = (material.source !== MaterialSource.Model) ? Loc ('Default') : Loc ('Model');
        this.AddProperty (table, new Property (PropertyType.Text, Loc ('Source'), materialSource));
        this.AddProperty (table, new Property (PropertyType.Text, Loc ('Type'), typeString));
        if (material.vertexColors) {
            this.AddProperty (table, new Property (PropertyType.Text, Loc ('Color'), Loc ('Vertex colors')));
        } else {
            this.AddProperty (table, new Property (PropertyType.Color, Loc ('Color'), material.color));
            if (material.type === MaterialType.Phong) {
                this.AddProperty (table, new Property (PropertyType.Color, Loc ('Ambient'), material.ambient));
                this.AddProperty (table, new Property (PropertyType.Color, Loc ('Specular'), material.specular));
            }
        }
        if (material.type === MaterialType.Physical) {
            this.AddProperty (table, new Property (PropertyType.Percent, Loc ('Metalness'), material.metalness));
            this.AddProperty (table, new Property (PropertyType.Percent, Loc ('Roughness'), material.roughness));
        }
        this.AddProperty (table, new Property (PropertyType.Percent, Loc ('Opacity'), material.opacity));
        AddTextureMap (this, table, Loc ('Diffuse Map'), material.diffuseMap);
        AddTextureMap (this, table, Loc ('Bump Map'), material.bumpMap);
        AddTextureMap (this, table, Loc ('Normal Map'), material.normalMap);
        AddTextureMap (this, table, Loc ('Emissive Map'), material.emissiveMap);
        if (material.type === MaterialType.Phong) {
            AddTextureMap (this, table, Loc ('Specular Map'), material.specularMap);
        } else if (material.type === MaterialType.Physical) {
            AddTextureMap (this, table, Loc ('Metallic Map'), material.metalnessMap);
        }
        this.Resize ();
    }

    AddPropertyGroup (table, propertyGroup)
    {
        let row = AddDiv (table, 'ov_property_table_row group', propertyGroup.name);
        row.setAttribute ('title', propertyGroup.name);
    }

    AddProperty (table, property)
    {
        let row = AddDiv (table, 'ov_property_table_row');
        let nameColumn = AddDiv (row, 'ov_property_table_cell ov_property_table_name', property.name + ':');
        let valueColumn = AddDiv (row, 'ov_property_table_cell ov_property_table_value');
        nameColumn.setAttribute ('title', property.name);
        this.DisplayPropertyValue (property, valueColumn);
        return row;
    }

    AddPropertyInGroup (table, property)
    {
        let row = this.AddProperty (table, property);
        row.classList.add ('ingroup');
    }

    AddCalculatedProperty (table, name, calculateValue)
    {
        let row = AddDiv (table, 'ov_property_table_row');
        let nameColumn = AddDiv (row, 'ov_property_table_cell ov_property_table_name', name + ':');
        let valueColumn = AddDiv (row, 'ov_property_table_cell ov_property_table_value');
        nameColumn.setAttribute ('title', name);

        let calculateButton = AddDiv (valueColumn, 'ov_property_table_button', Loc ('Calculate...'));
        calculateButton.addEventListener ('click', () => {
            ClearDomElement (valueColumn);
            valueColumn.innerHTML = Loc ('Please wait...');
            RunTaskAsync (() => {
                let propertyValue = calculateValue ();
                if (propertyValue === null) {
                    valueColumn.innerHTML = '-';
                } else {
                    this.DisplayPropertyValue (propertyValue, valueColumn);
                }
            });
        });
    }

    DisplayPropertyValue (property, targetDiv)
    {
        ClearDomElement (targetDiv);
        let valueHtml = null;
        let valueTitle = null;
        if (property.type === PropertyType.Text) {
            if (IsUrl (property.value)) {
                valueHtml = '<a target="_blank" href="' + property.value + '">' + property.value + '</a>';
                valueTitle = property.value;
            } else {
                valueHtml = PropertyToString (property);
            }
        } else if (property.type === PropertyType.Color) {
            let hexString = '#' + RGBColorToHexString (property.value);
            let colorCircle = CreateInlineColorCircle (property.value);
            targetDiv.appendChild (colorCircle);
            AddDomElement (targetDiv, 'span', null, hexString);
        } else {
            valueHtml = PropertyToString (property);
        }
        if (valueHtml !== null) {
            targetDiv.innerHTML = valueHtml;
            targetDiv.setAttribute ('title', valueTitle !== null ? valueTitle : valueHtml);
        }
    }
}
