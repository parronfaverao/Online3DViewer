import { Coord2D, CoordDistance2D, SubCoord2D } from '../geometry/coord2d.js';
import { CoordDistance3D, CrossVector3D, SubCoord3D, VectorAngle3D, AddCoord3D } from '../geometry/coord3d.js';
import { DegRad, IsGreater, IsLower, IsZero } from '../geometry/geometry.js';
import { ParabolicTweenFunction, TweenCoord3D } from '../geometry/tween.js';
import { CameraIsEqual3D, NavigationMode } from './camera.js';
import { GetDomElementClientCoordinates } from './domutils.js';

export class MouseInteraction
{
    constructor ()
    {
        this.prev = new Coord2D (0.0, 0.0);
        this.curr = new Coord2D (0.0, 0.0);
        this.diff = new Coord2D (0.0, 0.0);
        this.buttons = [];
    }

    Down (canvas, ev)
    {
        this.buttons.push (ev.which);
        this.curr = this.GetPositionFromEvent (canvas, ev);
        this.prev = this.curr.Clone ();
    }

    Move (canvas, ev)
    {
        this.curr = this.GetPositionFromEvent (canvas, ev);
		this.diff = SubCoord2D (this.curr, this.prev);
		this.prev = this.curr.Clone ();
	}

	Up (canvas, ev)
	{
		let buttonIndex = this.buttons.indexOf (ev.which);
		if (buttonIndex !== -1) {
			this.buttons.splice (buttonIndex, 1);
		}
		this.curr = this.GetPositionFromEvent (canvas, ev);
	}

	Leave (canvas, ev)
	{
		this.buttons = [];
		this.curr = this.GetPositionFromEvent (canvas, ev);
	}

	IsButtonDown ()
	{
		return this.buttons.length > 0;
	}

	GetButton ()
	{
		let length = this.buttons.length;
		if (length === 0) {
			return 0;
		}
		return this.buttons[length - 1];
	}

	GetPosition ()
	{
		return this.curr;
	}

	GetMoveDiff ()
	{
		return this.diff;
	}

	GetPositionFromEvent (canvas, ev)
	{
		return GetDomElementClientCoordinates (canvas, ev.clientX, ev.clientY);
	}
}

export class TouchInteraction
{
	constructor ()
	{
		this.prevPos = new Coord2D (0.0, 0.0);
		this.currPos = new Coord2D (0.0, 0.0);
		this.diffPos = new Coord2D (0.0, 0.0);
		this.prevDist = 0.0;
		this.currDist = 0.0;
		this.diffDist = 0.0;
		this.fingers = 0;
	}

	Start (canvas, ev)
	{
		if (ev.touches.length === 0) {
			return;
		}

		this.fingers = ev.touches.length;

		this.currPos = this.GetPositionFromEvent (canvas, ev);
		this.prevPos = this.currPos.Clone ();

		this.currDist = this.GetTouchDistanceFromEvent (canvas, ev);
		this.prevDist = this.currDist;
	}

	Move (canvas, ev)
	{
		if (ev.touches.length === 0) {
			return;
		}

		this.currPos = this.GetPositionFromEvent (canvas, ev);
		this.diffPos = SubCoord2D (this.currPos, this.prevPos);
		this.prevPos = this.currPos.Clone ();

		this.currDist = this.GetTouchDistanceFromEvent (canvas, ev);
		this.diffDist = this.currDist - this.prevDist;
		this.prevDist = this.currDist;
	}

	End (canvas, ev)
	{
		if (ev.touches.length === 0) {
			return;
		}

		this.fingers = 0;
		this.currPos = this.GetPositionFromEvent (canvas, ev);
		this.currDist = this.GetTouchDistanceFromEvent (canvas, ev);
	}

	IsFingerDown ()
	{
		return this.fingers !== 0;
	}

	GetFingerCount ()
	{
		return this.fingers;
	}

	GetPosition ()
	{
		return this.currPos;
	}

	GetMoveDiff ()
	{
		return this.diffPos;
	}

	GetDistanceDiff ()
	{
		return this.diffDist;
	}

	GetPositionFromEvent (canvas, ev)
	{
		let coord = null;
		if (ev.touches.length !== 0) {
			let touchEv = ev.touches[0];
			coord = GetDomElementClientCoordinates (canvas, touchEv.pageX, touchEv.pageY);
		}
		return coord;
	}

	GetTouchDistanceFromEvent (canvas, ev)
	{
		if (ev.touches.length !== 2) {
			return 0.0;
		}
		let touchEv1 = ev.touches[0];
		let touchEv2 = ev.touches[1];
		let distance = CoordDistance2D (
			GetDomElementClientCoordinates (canvas, touchEv1.pageX, touchEv1.pageY),
			GetDomElementClientCoordinates (canvas, touchEv2.pageX, touchEv2.pageY)
		);
		return distance;
	}
}

export class ClickDetector
{
	constructor ()
	{
		this.isClick = false;
		this.startPosition = null;
	}

	Start (startPosition)
	{
		this.isClick = true;
		this.startPosition = startPosition;
	}

	Move (currentPosition)
	{
		if (!this.isClick) {
			return;
		}

		if (this.startPosition !== null) {
			const maxClickDistance = 3.0;
			const currentDistance = CoordDistance2D (this.startPosition, currentPosition);
			if (currentDistance > maxClickDistance) {
				this.Cancel ();
			}
		} else {
			this.Cancel ();
		}
	}

	End ()
	{
		this.startPosition = null;
	}

	Cancel ()
	{
		this.isClick = false;
		this.startPosition = null;
	}

	IsClick ()
	{
		return this.isClick;
	}
}

export const NavigationType =
{
	None : 0,
	Orbit : 1,
	Pan : 2,
	Zoom : 3
};

export class Navigation
{
	constructor (canvas, camera, callbacks)
	{
		this.canvas = canvas;
		this.camera = camera;
		this.callbacks = callbacks;
		this.navigationMode = NavigationMode.FixedUpVector;
		this.zoomSpeedMultiplier = 1.0;
		this.updateRequested = false; // For requestAnimationFrame optimization

		this.mouse = new MouseInteraction ();
		this.touch = new TouchInteraction ();
		this.clickDetector = new ClickDetector ();

		this.onMouseClick = null;
		this.onMouseMove = null;
		this.onContext = null;

		if (this.canvas.addEventListener) {
			this.canvas.addEventListener ('mousedown', this.OnMouseDown.bind (this));
			this.canvas.addEventListener ('wheel', this.OnMouseWheel.bind (this), { passive: false });
			this.canvas.addEventListener ('touchstart', this.OnTouchStart.bind (this), { passive: false });
			this.canvas.addEventListener ('touchmove', this.OnTouchMove.bind (this), { passive: false });
			this.canvas.addEventListener ('touchcancel', this.OnTouchEnd.bind (this));
			this.canvas.addEventListener ('touchend', this.OnTouchEnd.bind (this));
			this.canvas.addEventListener ('contextmenu', this.OnContextMenu.bind (this));
		}
		if (document.addEventListener) {
			document.addEventListener ('mousemove', this.OnMouseMove.bind (this));
			document.addEventListener ('mouseup', this.OnMouseUp.bind (this));
			document.addEventListener ('mouseleave', this.OnMouseLeave.bind (this));
		}
	}

	SetMouseClickHandler (onMouseClick)
	{
		this.onMouseClick = onMouseClick;
	}

	SetMouseMoveHandler (onMouseMove)
	{
		this.onMouseMove = onMouseMove;
	}

	SetContextMenuHandler (onContext)
	{
		this.onContext = onContext;
	}

	GetNavigationMode ()
	{
		return this.navigationMode;
	}

	SetNavigationMode (navigationMode)
	{
		this.navigationMode = navigationMode;
	}

	SetZoomSpeed (zoomSpeedMultiplier)
	{
		console.log('Navigation SetZoomSpeed called with:', zoomSpeedMultiplier); // Debug log
		this.zoomSpeedMultiplier = zoomSpeedMultiplier;
	}

	GetCamera ()
	{
		return this.camera;
	}

	SetCamera (camera)
	{
		this.camera = camera;
	}

	MoveCamera (newCamera, stepCount)
	{
		function Step (obj, steps, count, index)
		{
			obj.camera.eye = steps.eye[index];
			obj.camera.center = steps.center[index];
			obj.camera.up = steps.up[index];
			obj.Update ();

			if (index < count - 1) {
				requestAnimationFrame (() => {
					Step (obj, steps, count, index + 1);
				});
			}
		}

		if (newCamera === null) {
			return;
		}

		if (stepCount === 0 || CameraIsEqual3D (this.camera, newCamera)) {
			this.camera = newCamera;
		} else {
			let tweenFunc = ParabolicTweenFunction;
			let steps = {
				eye : TweenCoord3D (this.camera.eye, newCamera.eye, stepCount, tweenFunc),
				center : TweenCoord3D (this.camera.center, newCamera.center, stepCount, tweenFunc),
				up : TweenCoord3D (this.camera.up, newCamera.up, stepCount, tweenFunc)
			};
			requestAnimationFrame (() => {
				Step (this, steps, stepCount, 0);
			});
		}

		this.Update ();
	}

	GetFitToSphereCamera (center, radius)
	{
		if (IsZero (radius)) {
			return null;
		}

		let fitCamera = this.camera.Clone ();

		let offsetToOrigo = SubCoord3D (fitCamera.center, center);
		fitCamera.eye = SubCoord3D (fitCamera.eye, offsetToOrigo);
		fitCamera.center = center.Clone ();

		let centerEyeDirection = SubCoord3D (fitCamera.eye, fitCamera.center).Normalize ();
		let fieldOfView = this.camera.fov / 2.0;
		if (this.canvas.width < this.canvas.height) {
			fieldOfView = fieldOfView * this.canvas.width / this.canvas.height;
		}
		let distance = radius / Math.sin (fieldOfView * DegRad);

		fitCamera.eye = fitCamera.center.Clone ().Offset (centerEyeDirection, distance);

		return fitCamera;
	}

	OnMouseDown (ev)
	{
		ev.preventDefault ();

		this.mouse.Down (this.canvas, ev);
		this.clickDetector.Start (this.mouse.GetPosition ());
	}

	OnMouseMove (ev)
	{
		this.mouse.Move (this.canvas, ev);
		this.clickDetector.Move (this.mouse.GetPosition ());
		if (this.onMouseMove) {
			let mouseCoords = GetDomElementClientCoordinates (this.canvas, ev.clientX, ev.clientY);
			this.onMouseMove (mouseCoords);
		}

		if (!this.mouse.IsButtonDown ()) {
			return;
		}

		let moveDiff = this.mouse.GetMoveDiff ();
		let mouseButton = this.mouse.GetButton ();

		let navigationType = NavigationType.None;
		if (mouseButton === 1) {
			if (ev.ctrlKey) {
				navigationType = NavigationType.Zoom;
			} else if (ev.shiftKey) {
				navigationType = NavigationType.Pan;
			} else {
				navigationType = NavigationType.Orbit;
			}
		} else if (mouseButton === 2 || mouseButton === 3) {
			navigationType = NavigationType.Pan;
		}

		if (navigationType === NavigationType.Orbit) {
			let orbitRatio = 0.5;
			this.Orbit (moveDiff.x * orbitRatio, moveDiff.y * orbitRatio);
		} else if (navigationType === NavigationType.Pan) {
			let eyeCenterDistance = CoordDistance3D (this.camera.eye, this.camera.center);
			let panRatio = 0.001 * eyeCenterDistance;
			this.Pan (moveDiff.x * panRatio, moveDiff.y * panRatio);
		} else if (navigationType === NavigationType.Zoom) {
			let zoomRatio = 0.01 * this.zoomSpeedMultiplier;
			this.Zoom (-moveDiff.y * zoomRatio);
		}

		this.Update ();
	}

	OnMouseUp (ev)
	{
		this.mouse.Up (this.canvas, ev);
		this.clickDetector.End ();

		if (this.clickDetector.IsClick ()) {
			let mouseCoords = this.mouse.GetPosition ();
			this.Click (ev.which, mouseCoords);
		}
	}

	OnMouseLeave (ev)
	{
		this.mouse.Leave (this.canvas, ev);
		this.clickDetector.Cancel ();
	}

	OnTouchStart (ev)
	{
		ev.preventDefault ();

		this.touch.Start (this.canvas, ev);
		this.clickDetector.Start (this.touch.GetPosition ());
	}

	OnTouchMove (ev)
	{
		ev.preventDefault ();

		this.touch.Move (this.canvas, ev);
		this.clickDetector.Move (this.touch.GetPosition ());
		if (!this.touch.IsFingerDown ()) {
			return;
		}

		let moveDiff = this.touch.GetMoveDiff ();
		let distanceDiff = this.touch.GetDistanceDiff ();
		let fingerCount = this.touch.GetFingerCount ();

		let navigationType = NavigationType.None;
		if (fingerCount === 1) {
			navigationType = NavigationType.Orbit;
		} else if (fingerCount === 2) {
			navigationType = NavigationType.Pan;
		}

		if (navigationType === NavigationType.Orbit) {
			let orbitRatio = 0.5;
			this.Orbit (moveDiff.x * orbitRatio, moveDiff.y * orbitRatio);
		} else if (navigationType === NavigationType.Pan) {
			let zoomRatio = 0.02 * this.zoomSpeedMultiplier;
			this.Zoom (distanceDiff * zoomRatio);
			let panRatio = 0.001 * CoordDistance3D (this.camera.eye, this.camera.center);
			this.Pan (moveDiff.x * panRatio, moveDiff.y * panRatio);
		}

		this.Update ();
	}

	OnTouchEnd (ev)
	{
		ev.preventDefault ();

		this.touch.End (this.canvas, ev);
		this.clickDetector.End ();

		if (this.clickDetector.IsClick ()) {
			let touchCoords = this.touch.GetPosition ();
			if (this.touch.GetFingerCount () === 1) {
				this.Click (1, touchCoords);
			}
		}
	}

	OnMouseWheel (ev)
	{
		let params = ev || window.event;
		params.preventDefault ();

		// Get mouse coordinates relative to canvas
		let rect = this.canvas.getBoundingClientRect();
		let mouseX = params.clientX - rect.left;
		let mouseY = params.clientY - rect.top;

		// More responsive wheel handling - FIX: Remove negative sign to fix inverted scroll
		let delta = params.deltaY;
		let ratio = 0.2 * this.zoomSpeedMultiplier;

		// Normalize different wheel modes (pixel, line, page)
		if (params.deltaMode === 1) { // line mode
			delta *= 16;
		} else if (params.deltaMode === 2) { // page mode
			delta *= 800;
		}

		// Scale ratio based on delta magnitude for smoother response
		let normalizedDelta = Math.max(-1, Math.min(1, delta / 120));
		ratio *= normalizedDelta;

		this.ZoomToPoint (ratio, mouseX, mouseY);
		this.Update ();
	}

	OnContextMenu (ev)
	{
		ev.preventDefault ();

		if (this.clickDetector.IsClick ()) {
			this.Context (ev.clientX, ev.clientY);
			this.clickDetector.Cancel ();
		}
	}

	Orbit (angleX, angleY)
	{
		let radAngleX = angleX * DegRad;
		let radAngleY = angleY * DegRad;

		let viewDirection = SubCoord3D (this.camera.center, this.camera.eye).Normalize ();
		let horizontalDirection = CrossVector3D (viewDirection, this.camera.up).Normalize ();

		if (this.navigationMode === NavigationMode.FixedUpVector) {
			let originalAngle = VectorAngle3D (viewDirection, this.camera.up);
			let newAngle = originalAngle + radAngleY;
			if (IsGreater (newAngle, 0.0) && IsLower (newAngle, Math.PI)) {
				this.camera.eye.Rotate (horizontalDirection, -radAngleY, this.camera.center);
			}
			this.camera.eye.Rotate (this.camera.up, -radAngleX, this.camera.center);
		} else if (this.navigationMode === NavigationMode.FreeOrbit) {
			let verticalDirection = CrossVector3D (horizontalDirection, viewDirection).Normalize ();
			this.camera.eye.Rotate (horizontalDirection, -radAngleY, this.camera.center);
			this.camera.eye.Rotate (verticalDirection, -radAngleX, this.camera.center);
			this.camera.up = verticalDirection;
		}
	}

	Pan (moveX, moveY)
	{
		let viewDirection = SubCoord3D (this.camera.center, this.camera.eye).Normalize ();
		let horizontalDirection = CrossVector3D (viewDirection, this.camera.up).Normalize ();
		let verticalDirection = CrossVector3D (horizontalDirection, viewDirection).Normalize ();

		this.camera.eye.Offset (horizontalDirection, -moveX);
		this.camera.center.Offset (horizontalDirection, -moveX);

		this.camera.eye.Offset (verticalDirection, moveY);
		this.camera.center.Offset (verticalDirection, moveY);
	}

	Zoom (ratio)
	{
		let direction = SubCoord3D (this.camera.center, this.camera.eye);
		let distance = direction.Length ();

		// Early exit for very small movements
		if (Math.abs(ratio) < 1e-8) {
			return;
		}

		let move = distance * ratio;
		// Prevent camera.eye from matching center exactly
		if (Math.abs(distance + move) < 1e-6) {
			move = (move > 0 ? 1 : -1) * 1e-6;
		}
		this.camera.eye.Offset(direction, move);
	}

	ZoomToPoint (ratio, mouseX, mouseY)
	{
		// Early exit for very small movements
		if (Math.abs(ratio) < 1e-8) {
			return;
		}

		// Get canvas dimensions
		let canvasWidth = this.canvas.width;
		let canvasHeight = this.canvas.height;

		// Convert mouse coordinates to normalized device coordinates (-1 to 1)
		// FIX: Correct NDC calculation
		let ndcX = (mouseX / canvasWidth) * 2 - 1;
		let ndcY = (mouseY / canvasHeight) * 2 - 1; // Remove negation to fix inversion

		// Calculate the current camera vectors
		let eyeToCenter = SubCoord3D (this.camera.center, this.camera.eye);
		let distance = eyeToCenter.Length ();
		let forward = eyeToCenter.Clone ().Normalize ();

		// Calculate right and up vectors for the camera
		let up = this.camera.up.Clone ().Normalize ();
		let right = CrossVector3D (forward, up).Normalize ();
		let actualUp = CrossVector3D (right, forward).Normalize ();

		// Calculate the field of view and aspect ratio
		let fov = 45.0 * Math.PI / 180.0;
		let aspect = canvasWidth / canvasHeight;
		let halfHeight = Math.tan(fov / 2) * distance;
		let halfWidth = halfHeight * aspect;

		// Calculate the offset from the center based on mouse position
		let rightOffset = right.Clone ().MultiplyScalar (ndcX * halfWidth);
		let upOffset = actualUp.Clone ().MultiplyScalar (-ndcY * halfHeight); // Flip Y to fix inversion
		let totalOffset = AddCoord3D (rightOffset, upOffset);

		// Calculate the target point in world space
		let worldTarget = AddCoord3D (this.camera.center, totalOffset);

		// Calculate zoom movement
		let move = distance * ratio;

		// Prevent camera.eye from matching center exactly
		if (Math.abs(distance + move) < 1e-6) {
			move = (move > 0 ? 1 : -1) * 1e-6;
		}

		// Simple approach: interpolate between current center and target point
		let zoomFactor = move / distance;
		let newCenter = AddCoord3D (
			this.camera.center.Clone ().MultiplyScalar (1 - zoomFactor * 0.1),
			worldTarget.Clone ().MultiplyScalar (zoomFactor * 0.1)
		);

		// Move camera eye to maintain distance
		let newEyeToCenter = forward.Clone ().MultiplyScalar (distance + move);
		this.camera.eye = SubCoord3D (newCenter, newEyeToCenter);
		this.camera.center = newCenter;
	}

	Update ()
	{
		if (!this.updateRequested) {
			this.updateRequested = true;
			requestAnimationFrame (() => {
				this.updateRequested = false;
				this.callbacks.onUpdate ();
			});
		}
	}

	Click (button, mouseCoords)
	{
		if (this.onMouseClick) {
			this.onMouseClick (button, mouseCoords);
		}
	}

	Context (clientX, clientY)
	{
		if (this.onContext) {
			let globalCoords = {
				x : clientX,
				y : clientY
			};
			let localCoords = GetDomElementClientCoordinates (this.canvas, clientX, clientY);
			this.onContext (globalCoords, localCoords);
		}
	}
}
