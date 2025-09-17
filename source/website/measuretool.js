import { BigEps, IsEqualEps, RadDeg } from '../engine/geometry/geometry.js';
import { AddDiv, ClearDomElement } from '../engine/viewer/domutils.js';
import { AddSvgIconElement, IsDarkTextNeededForColor } from './utils.js';
import { Loc } from '../engine/core/localization.js';
import { Unit } from '../engine/model/unit.js';

import * as THREE from 'three';
import { ColorComponentToFloat, RGBColor } from '../engine/model/color.js';
import { IntersectionMode } from '../engine/viewer/viewermodel.js';

function GetFaceWorldNormal (intersection)
{
    let normalMatrix = new THREE.Matrix4 ();
    intersection.object.updateWorldMatrix (true, false);
    normalMatrix.extractRotation (intersection.object.matrixWorld);
    let faceNormal = intersection.face.normal.clone ();
    faceNormal.applyMatrix4 (normalMatrix);
    return faceNormal;
}

function CreateMaterial ()
{
    return new THREE.LineBasicMaterial ({
        color : 0x263238,
        depthTest : false
    });
}

function CreateLineFromPoints (points, material)
{
    let geometry = new THREE.BufferGeometry ().setFromPoints (points);
    return new THREE.Line (geometry, material);
}

class Marker
{
    constructor (intersection, radius)
    {
        this.intersection = null;
        this.markerObject = new THREE.Object3D ();

        let material = CreateMaterial ();
        let circleCurve = new THREE.EllipseCurve (0.0, 0.0, radius, radius, 0.0, 2.0 * Math.PI, false, 0.0);
        this.markerObject.add (CreateLineFromPoints (circleCurve.getPoints (50), material));
        this.markerObject.add (CreateLineFromPoints ([new THREE.Vector3 (-radius, 0.0, 0.0), new THREE.Vector3 (radius, 0.0, 0.0)], material));
        this.markerObject.add (CreateLineFromPoints ([new THREE.Vector3 (0.0, -radius, 0.0), new THREE.Vector3 (0.0, radius, 0.0)], material));

        this.UpdatePosition (intersection);
    }

    UpdatePosition (intersection)
    {
        this.intersection = intersection;
        let faceNormal = GetFaceWorldNormal (this.intersection);
        this.markerObject.updateMatrixWorld (true);
        this.markerObject.position.set (0.0, 0.0, 0.0);
        this.markerObject.lookAt (faceNormal);
        this.markerObject.position.set (this.intersection.point.x, this.intersection.point.y, this.intersection.point.z);
    }

    Show (show)
    {
        this.markerObject.visible = show;
    }

    GetIntersection ()
    {
        return this.intersection;
    }

    GetObject ()
    {
        return this.markerObject;
    }
}

function CalculateMarkerValues (aMarker, bMarker, model, settings)
{
    const aIntersection = aMarker.GetIntersection ();
    const bIntersection = bMarker.GetIntersection ();
    let result = {
        pointsDistance : null,
        xDistance : null,
        yDistance : null,
        zDistance : null,
        parallelFacesDistance : null,
        facesAngle : null
    };

    const aNormal = GetFaceWorldNormal (aIntersection);
    const bNormal = GetFaceWorldNormal (bIntersection);

    // Calculate actual 3D distance
    result.pointsDistance = aIntersection.point.distanceTo (bIntersection.point);

    // Calculate component distances along each axis
    const deltaVector = new THREE.Vector3().subVectors(bIntersection.point, aIntersection.point);
    result.xDistance = Math.abs(deltaVector.x);
    result.yDistance = Math.abs(deltaVector.y);
    result.zDistance = Math.abs(deltaVector.z);

    // Apply same unit conversion logic as details panel
    let unit = model ? model.GetUnit() : Unit.Millimeter; // Default to mm if no model
    let scaleFactor = 1.0; // Start with no conversion

    // First convert from model units to mm
    if (unit === Unit.Meter) {
        scaleFactor = 1000.0;
    } else if (unit === Unit.Centimeter) {
        scaleFactor = 10.0;
    }
    // Note: Unit.Millimeter uses scaleFactor = 1.0 (no conversion)

    // Then apply user scale factor
    if (settings && settings.unitScaleFactor) {
        scaleFactor *= settings.unitScaleFactor;
    }

    result.pointsDistance *= scaleFactor;
    result.xDistance *= scaleFactor;
    result.yDistance *= scaleFactor;
    result.zDistance *= scaleFactor;    result.facesAngle = aNormal.angleTo (bNormal);
    if (IsEqualEps (result.facesAngle, 0.0, BigEps) || IsEqualEps (result.facesAngle, Math.PI, BigEps)) {
        let aPlane = new THREE.Plane ().setFromNormalAndCoplanarPoint (aNormal, aIntersection.point);
        result.parallelFacesDistance = Math.abs (aPlane.distanceToPoint (bIntersection.point)) * scaleFactor;
    }
    return result;
}

export class MeasureTool
{
    constructor (viewer, settings, getModel)
    {
        this.viewer = viewer;
        this.settings = settings;
        this.getModel = getModel;
        this.isActive = false;
        this.markers = [];
        this.tempMarker = null;

        this.panel = null;
        this.button = null;
    }

    SetButton (button)
    {
        this.button = button;
    }

    IsActive ()
    {
        return this.isActive;
    }

    SetActive (isActive)
    {
        if (this.isActive === isActive) {
            return;
        }
        this.isActive = isActive;
        this.button.SetSelected (isActive);
        if (this.isActive) {
            this.panel = AddDiv (document.body, 'ov_measure_panel');
            this.UpdatePanel ();
            this.Resize ();
        } else {
            this.ClearMarkers ();
            this.panel.remove ();
        }
    }

    Click (mouseCoordinates)
    {
        let intersection = this.viewer.GetMeshIntersectionUnderMouse (IntersectionMode.MeshOnly, mouseCoordinates);
        if (intersection === null) {
            this.ClearMarkers ();
            this.UpdatePanel ();
            return;
        }

        // Snap to closest vertex
        let snappedIntersection = this.GetSnappedIntersection(intersection);

        if (this.markers.length === 2) {
            this.ClearMarkers ();
        }

        this.AddMarker (snappedIntersection);
        this.UpdatePanel ();
    }

    MouseMove (mouseCoordinates)
    {
        let intersection = this.viewer.GetMeshIntersectionUnderMouse (IntersectionMode.MeshOnly, mouseCoordinates);
        if (intersection === null) {
            if (this.tempMarker !== null) {
                this.tempMarker.Show (false);
                this.viewer.Render ();
            }
            return;
        }
        // Snap to closest vertex
        let snappedIntersection = this.GetSnappedIntersection(intersection);
        if (this.tempMarker === null) {
            this.tempMarker = this.GenerateMarker (snappedIntersection);
        }
        this.tempMarker.UpdatePosition (snappedIntersection);
        this.tempMarker.Show (true);
        this.viewer.Render ();
    }
    // Given a THREE.js intersection, return a new intersection with the closest vertex as the point
    GetSnappedIntersection (intersection)
    {
        if (!intersection.object) {
            return intersection;
        }
        // Try meshInstanceId method first
        let closestVertex = null;
        let minDist = Number.POSITIVE_INFINITY;
        let found = false;
        if (intersection.object.userData && intersection.object.userData.meshInstanceId && this.viewer.model && this.viewer.model.GetMeshInstance) {
            let meshInstanceId = intersection.object.userData.meshInstanceId;
            let meshInstance = this.viewer.model.GetMeshInstance(meshInstanceId);
            if (meshInstance) {
                meshInstance.EnumerateVertices((vertex) => {
                    let dist = intersection.point.distanceTo(vertex);
                    if (dist < minDist) {
                        minDist = dist;
                        closestVertex = vertex;
                    }
                });
                found = true;
            }
        }
        // Fallback: use geometry vertices directly
        if (!found && intersection.object.geometry && intersection.object.geometry.attributes && intersection.object.geometry.attributes.position) {
            let posAttr = intersection.object.geometry.attributes.position;
            for (let i = 0; i < posAttr.count; i++) {
                let vx = posAttr.getX(i);
                let vy = posAttr.getY(i);
                let vz = posAttr.getZ(i);
                let v = new THREE.Vector3(vx, vy, vz);
                // Transform to world coordinates
                v.applyMatrix4(intersection.object.matrixWorld);
                let dist = intersection.point.distanceTo(v);
                if (dist < minDist) {
                    minDist = dist;
                    closestVertex = v;
                }
            }
        }
        if (closestVertex) {
            let snapped = Object.assign({}, intersection);
            snapped.point = closestVertex.clone ? closestVertex.clone() : new THREE.Vector3(closestVertex.x, closestVertex.y, closestVertex.z);
            return snapped;
        }
        return intersection;
    }

    AddMarker (intersection)
    {
        let marker = this.GenerateMarker (intersection);
        this.markers.push (marker);
        if (this.markers.length === 2) {
            let material = CreateMaterial ();
            let aPoint = this.markers[0].GetIntersection ().point;
            let bPoint = this.markers[1].GetIntersection ().point;
            this.viewer.AddExtraObject (CreateLineFromPoints ([aPoint, bPoint], material));
        }
    }

    GenerateMarker (intersection)
    {
        let boundingSphere = this.viewer.GetBoundingSphere ((meshUserData) => {
            return true;
        });

        let radius = boundingSphere.radius / 20.0;
        let marker = new Marker (intersection, radius);
        this.viewer.AddExtraObject (marker.GetObject ());
        return marker;
    }

    UpdatePanel ()
    {
        function BlendBackgroundWithPageBackground (backgroundColor)
        {
            let bodyStyle = window.getComputedStyle (document.body, null);
            let bgColors = bodyStyle.backgroundColor.match (/\d+/g);
            if (bgColors.length < 3) {
                return new RGBColor (backgroundColor.r, backgroundColor.g, backgroundColor.b);
            }
            let alpha = ColorComponentToFloat (backgroundColor.a);
            return new RGBColor (
                parseInt (bgColors[0], 10) * (1.0 - alpha) + backgroundColor.r * alpha,
                parseInt (bgColors[1], 10) * (1.0 - alpha) + backgroundColor.g * alpha,
                parseInt (bgColors[2], 10) * (1.0 - alpha) + backgroundColor.b * alpha
            );
        }

        function AddValue (panel, icon, title, value)
        {
            let svgIcon = AddSvgIconElement (panel, icon, 'left_inline');
            svgIcon.title = title;
            AddDiv (panel, 'ov_measure_value', value);
        }

        ClearDomElement (this.panel);
        if (this.settings.backgroundIsEnvMap) {
            this.panel.style.color = '#ffffff';
            this.panel.style.backgroundColor = 'rgba(0,0,0,0.5)';
        } else {
            let blendedColor = BlendBackgroundWithPageBackground (this.settings.backgroundColor);
            if (IsDarkTextNeededForColor (blendedColor)) {
                this.panel.style.color = '#000000';
            } else {
                this.panel.style.color = '#ffffff';
            }
            this.panel.style.backgroundColor = 'transparent';
        }
        if (this.markers.length === 0) {
            this.panel.innerHTML = Loc ('Select a point.');
        } else if (this.markers.length === 1) {
            this.panel.innerHTML = Loc ('Select another point.');
        } else {
            let model = this.getModel ? this.getModel() : null;
            let calcResult = CalculateMarkerValues (this.markers[0], this.markers[1], model, this.settings);
            let unitName = this.settings.unitName || 'mm';

            // Check if we're in portrait mode (height > width)
            let isPortraitMode = window.innerHeight > window.innerWidth;

            if (isPortraitMode) {
                // Portrait mode: Display as two lines
                // Line 1: Distance | Angle
                let line1 = AddDiv (this.panel, 'ov_measure_line', '');

                if (calcResult.pointsDistance !== null) {
                    AddValue (line1, 'measure_distance', '', calcResult.pointsDistance.toFixed (2) + ' ' + unitName);
                }

                if (calcResult.facesAngle !== null) {
                    let separator1 = AddDiv (line1, 'ov_measure_separator', ' | ');
                    let degreeValue = calcResult.facesAngle * RadDeg;
                    AddValue (line1, 'measure_angle', '', degreeValue.toFixed (1) + '\xB0');
                }

                // Line 2: X | Y | Z
                let line2 = AddDiv (this.panel, 'ov_measure_line', '');
                let hasXYZ = false;

                if (calcResult.zDistance !== null) {
                    AddDiv (line2, 'ov_measure_value', 'X: ' + calcResult.zDistance.toFixed (2) + ' ' + unitName);
                    hasXYZ = true;
                }

                if (calcResult.xDistance !== null) {
                    if (hasXYZ) {
                        AddDiv (line2, 'ov_measure_separator', ' | ');
                    }
                    AddDiv (line2, 'ov_measure_value', 'Y: ' + calcResult.xDistance.toFixed (2) + ' ' + unitName);
                    hasXYZ = true;
                }

                if (calcResult.yDistance !== null) {
                    if (hasXYZ) {
                        AddDiv (line2, 'ov_measure_separator', ' | ');
                    }
                    AddDiv (line2, 'ov_measure_value', 'Z: ' + calcResult.yDistance.toFixed (2) + ' ' + unitName);
                }
            } else {
                // Landscape mode: Single line display with all measurements separated by "|"
                // Order: Distance, Angle, X, Y, Z
                if (calcResult.pointsDistance !== null) {
                    AddValue (this.panel, 'measure_distance', '', calcResult.pointsDistance.toFixed (2) + ' ' + unitName);
                }

                if (calcResult.facesAngle !== null) {
                    let separator1 = AddDiv (this.panel, 'ov_measure_separator', ' | ');
                    let degreeValue = calcResult.facesAngle * RadDeg;
                    AddValue (this.panel, 'measure_angle', '', degreeValue.toFixed (1) + '\xB0');
                }

                if (calcResult.zDistance !== null) {
                    let separator2 = AddDiv (this.panel, 'ov_measure_separator', ' | ');
                    AddDiv (this.panel, 'ov_measure_value', 'X: ' + calcResult.zDistance.toFixed (2) + ' ' + unitName);
                }

                if (calcResult.xDistance !== null) {
                    let separator3 = AddDiv (this.panel, 'ov_measure_separator', ' | ');
                    AddDiv (this.panel, 'ov_measure_value', 'Y: ' + calcResult.xDistance.toFixed (2) + ' ' + unitName);
                }

                if (calcResult.yDistance !== null) {
                    let separator4 = AddDiv (this.panel, 'ov_measure_separator', ' | ');
                    AddDiv (this.panel, 'ov_measure_value', 'Z: ' + calcResult.yDistance.toFixed (2) + ' ' + unitName);
                }
            }
        }
        this.Resize ();
    }

    Resize ()
    {
        if (!this.isActive) {
            return;
        }
        let canvas = this.viewer.GetCanvas ();
        let canvasRect = canvas.getBoundingClientRect ();
        let panelRect = this.panel.getBoundingClientRect ();
        let canvasWidth = canvasRect.right - canvasRect.left;
        let panelWidth = panelRect.right - panelRect.left;
        this.panel.style.left = (canvasRect.left + (canvasWidth - panelWidth) / 2) + 'px';
        this.panel.style.top = (canvasRect.top + 10) + 'px';
    }

    ClearMarkers ()
    {
        this.viewer.ClearExtra ();
        this.markers = [];
        this.tempMarker = null;
    }
}
