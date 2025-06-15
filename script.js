// FFmpeg.wasm setup
const { createFFmpeg, fetchFile } = FFmpeg;
let ffmpeg; 

const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');

const penToolBtn = document.getElementById('penTool');
const eraserToolBtn = document.getElementById('eraserTool');
const strokeSizeSlider = document.getElementById('strokeSize');
const strokeSizeValue = document.getElementById('strokeSizeValue');
const strokeColorPicker = document.getElementById('strokeColor');
const clearActiveLayerBtn = document.getElementById('clearActiveLayerBtn');
const clearAllLayersBtn = document.getElementById('clearAllLayersBtn');
const animationSliders = {
    wiggleIntensity: { slider: document.getElementById('wiggleIntensity'), valueEl: document.getElementById('wiggleIntensityValue'), suffix: '' },
    breathingStroke: { slider: document.getElementById('breathingStroke'), valueEl: document.getElementById('breathingStrokeValue'), suffix: '' },
    shakeIntensity: { slider: document.getElementById('shakeIntensity'), valueEl: document.getElementById('shakeIntensityValue'), suffix: '' },
    animationSpeed: { slider: document.getElementById('animationSpeed'), valueEl: document.getElementById('animationSpeedValue'), suffix: 'x' }
};
const saveBtn = document.getElementById('saveBtn');
const loadInput = document.getElementById('loadInput');
const exportMp4Btn = document.getElementById('exportMp4Btn'); 
const exportGifBtn = document.getElementById('exportGifBtn'); 
const loadingIndicator = document.getElementById('loadingIndicator');
const loadingText = document.getElementById('loadingText'); 
const messageModal = document.getElementById('messageModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const layersListContainer = document.getElementById('layersList');
const addLayerBtn = document.getElementById('addLayerBtn');
const selectedLayerOpacityControl = document.getElementById('selectedLayerOpacityControl');
const layerOpacitySlider = document.getElementById('layerOpacity');
const layerOpacityValue = document.getElementById('layerOpacityValue');
const controlPanel = document.getElementById('controlPanel');
const controlPanelToggle = document.getElementById('controlPanelToggle');
const canvasContainer = document.getElementById('canvasContainer');

let isDrawing = false;
let currentTool = 'pen';
let currentStrokeSize = 10;
let currentStrokeColor = '#000000';
let layers = [];
let activeLayerId = null;
let lastX, lastY;
let animationFrameId;
let time = 0; 
let undoStack = [];
let redoStack = [];

const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 1080;
let viewTransform = { scale: 1, offsetX: 0, offsetY: 0 };
const EXPORT_WIDTH = 1920; 
const EXPORT_HEIGHT = 1080; 

function generateLayerId() { return Date.now() + Math.random().toString(36).substr(2, 9); }
function getActiveLayer() { return layers.find(layer => layer.id === activeLayerId); }
function getLayerIndex(layerId) { return layers.findIndex(l => l.id === layerId); }

function setActiveToolButton(activeBtn) {
    [penToolBtn, eraserToolBtn].forEach(btn => btn.classList.remove('active-tool'));
    if (activeBtn) activeBtn.classList.add('active-tool');
    updateCanvasCursor(); 
}

function updateCanvasCursor() {
    const size = Math.max(2, currentStrokeSize);
    let cursorSVG;
    if (currentTool === 'pen') {
        cursorSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="rgba(0,0,0,0.5)"/></svg>`;
        canvas.style.cursor = `url('data:image/svg+xml;utf8,${encodeURIComponent(cursorSVG)}') ${size/2} ${size/2}, auto`;
    } else if (currentTool === 'eraser') {
        const outlineWidth = Math.max(1, Math.min(2, size / 10)); 
        cursorSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2 - outlineWidth/2}" fill="rgba(255,255,255,0.5)" stroke="rgba(0,0,0,0.7)" stroke-width="${outlineWidth}"/></svg>`;
        canvas.style.cursor = `url('data:image/svg+xml;utf8,${encodeURIComponent(cursorSVG)}') ${size/2} ${size/2}, auto`;
    } else {
        canvas.style.cursor = 'default';
    }
}

function saveStateForUndo() {
    const state = { layers: JSON.parse(JSON.stringify(layers)), activeLayerId: activeLayerId, viewTransform: { ...viewTransform } };
    undoStack.push(state);
    if (undoStack.length > 30) undoStack.shift();
    redoStack = []; 
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
    undoBtn.classList.toggle('btn-disabled', undoBtn.disabled);
    redoBtn.classList.toggle('btn-disabled', redoBtn.disabled);
}

function showModal(title, message, customButtons = null, isCustom = false) {
    modalTitle.textContent = title;
    modalMessage.innerHTML = message; 
    const buttonContainer = messageModal.querySelector('.modal-button-container');
    buttonContainer.innerHTML = ''; 
    if (isCustom && customButtons && customButtons.length > 0) {
        customButtons.forEach(btnConfig => {
            const button = document.createElement('button');
            button.textContent = btnConfig.text;
            button.className = `btn modal-button ${btnConfig.class || 'btn-primary'}`;
            button.onclick = btnConfig.action;
            buttonContainer.appendChild(button);
        });
    } else {
        const closeButton = document.createElement('button');
        closeButton.className = 'btn modal-button btn-primary';
        closeButton.textContent = 'Close';
        closeButton.onclick = () => closeModal(messageModal);
        buttonContainer.appendChild(closeButton);
    }
    messageModal.classList.remove('hidden');
}

function closeModal(modalElement) { modalElement.classList.add('hidden'); }
messageModal.addEventListener('click', (event) => { 
    if (event.target === messageModal || event.target.classList.contains('modal-button')) { 
        if (!event.target.classList.contains('btn-danger') && !event.target.classList.contains('btn-primary') && event.target.textContent !== 'Delete' && event.target.textContent !== 'Clear Layer' && event.target.textContent !== 'Clear All') {
             closeModal(messageModal);
        }
    }
});

function setupCanvasDimensions() {
    canvas.width = WORLD_WIDTH;
    canvas.height = WORLD_HEIGHT;
    drawScene();
}

window.addEventListener('resize', () => { drawScene(); });

controlPanelToggle.addEventListener('click', () => {
    controlPanel.classList.toggle('open');
    controlPanelToggle.innerHTML = controlPanel.classList.contains('open') ? '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
});

if (canvasContainer) {
    canvasContainer.addEventListener('click', (event) => {
        if (controlPanel.classList.contains('open') && window.innerWidth <= 900) {
            if (event.target === canvasContainer || event.target === canvas) {
                controlPanel.classList.remove('open');
                controlPanelToggle.innerHTML = '<i class="fas fa-bars"></i>';
            }
        }
    });
}

function createNewLayer(nameSuffix = layers.length + 1, strokes = [], customAnimationSettings = null, isVisible = true, opacity = 1, isActive = false) {
    const defaultAnimSettings = {};
    for (const key in animationSliders) {
        defaultAnimSettings[key] = parseFloat(animationSliders[key].slider.defaultValue || animationSliders[key].slider.value);
    }
    return {
        id: generateLayerId(), name: `Layer ${nameSuffix}`, strokes: strokes,
        animationSettings: customAnimationSettings || defaultAnimSettings,
        isVisible: isVisible, opacity: opacity, isActive: isActive
    };
}

function addLayer() {
    saveStateForUndo();
    const newLayer = createNewLayer(layers.length + 1);
    const activeLayerIndex = getLayerIndex(activeLayerId);
    if (activeLayerIndex !== -1 && activeLayerIndex < layers.length -1) layers.splice(activeLayerIndex + 1, 0, newLayer);
    else layers.push(newLayer); 
    setActiveLayer(newLayer.id); 
    updateAnimationSlidersForActiveLayer();
}

function setActiveLayer(layerId) {
    const previouslyActiveLayer = getActiveLayer();
    if (previouslyActiveLayer) previouslyActiveLayer.isActive = false;
    activeLayerId = layerId;
    const currentActiveLayer = getActiveLayer();
    if (currentActiveLayer) {
        currentActiveLayer.isActive = true;
        layerOpacitySlider.value = currentActiveLayer.opacity * 100;
        layerOpacityValue.textContent = Math.round(currentActiveLayer.opacity * 100);
        selectedLayerOpacityControl.classList.remove('hidden');
    } else {
        selectedLayerOpacityControl.classList.add('hidden');
    }
    renderLayersList(); 
    updateAnimationSlidersForActiveLayer();
}

layerOpacitySlider.addEventListener('input', (e) => {
    const activeLayer = getActiveLayer();
    if (activeLayer) {
        activeLayer.opacity = parseFloat(e.target.value) / 100;
        layerOpacityValue.textContent = e.target.value;
        drawScene(); 
    }
});

function renderLayersList() {
    layersListContainer.innerHTML = ''; 
    if (layers.length === 0) {
        layersListContainer.innerHTML = '<p class="text-gray-500 text-sm p-2 text-center">No layers yet.</p>';
        selectedLayerOpacityControl.classList.add('hidden'); 
        return;
    }
    [...layers].reverse().forEach((layer) => { 
        const item = document.createElement('div');
        item.className = `layer-item ${layer.id === activeLayerId ? 'active-layer' : ''}`;
        item.dataset.layerId = layer.id;
        item.onclick = () => setActiveLayer(layer.id);
        
        const visibilityBtn = document.createElement('button');
        visibilityBtn.className = 'btn btn-sm';
        visibilityBtn.innerHTML = `<i class="fas ${layer.isVisible ? 'fa-eye' : 'fa-eye-slash'}"></i>`;
        visibilityBtn.title = layer.isVisible ? "Hide Layer" : "Show Layer";
        visibilityBtn.onclick = (e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); };
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'layer-name'; nameSpan.textContent = layer.name; nameSpan.title = "Double-click to Rename";
        nameSpan.ondblclick = (e) => { e.stopPropagation(); makeLayerNameEditable(layer.id, nameSpan); };
        
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'layer-controls';
        const upBtn = document.createElement('button'); upBtn.className = 'btn btn-sm'; upBtn.innerHTML = '<i class="fas fa-arrow-up"></i>'; upBtn.title = "Move Up";
        upBtn.disabled = getLayerIndex(layer.id) === layers.length - 1; 
        upBtn.onclick = (e) => { e.stopPropagation(); moveLayer(layer.id, 'up'); };
        if(upBtn.disabled) upBtn.classList.add('btn-disabled');
        
        const downBtn = document.createElement('button'); downBtn.className = 'btn btn-sm'; downBtn.innerHTML = '<i class="fas fa-arrow-down"></i>'; downBtn.title = "Move Down";
        downBtn.disabled = getLayerIndex(layer.id) === 0; 
        downBtn.onclick = (e) => { e.stopPropagation(); moveLayer(layer.id, 'down'); };
        if(downBtn.disabled) downBtn.classList.add('btn-disabled');

        const deleteBtn = document.createElement('button'); deleteBtn.className = 'btn btn-sm btn-danger'; deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>'; deleteBtn.title = "Delete Layer";
        deleteBtn.onclick = (e) => { e.stopPropagation(); deleteLayer(layer.id); };
        controlsDiv.append(upBtn, downBtn, deleteBtn);

        item.append(visibilityBtn, nameSpan, controlsDiv);
        layersListContainer.appendChild(item);
    });
    
    const activeLayer = getActiveLayer();
    if (activeLayer) selectedLayerOpacityControl.classList.remove('hidden');
    else selectedLayerOpacityControl.classList.add('hidden');
}

function makeLayerNameEditable(layerId, nameSpan) {
    const layer = layers.find(l => l.id === layerId); if (!layer) return;
    const input = document.createElement('input'); input.type = 'text'; input.className = 'layer-name-input'; input.value = layer.name;
    nameSpan.replaceWith(input); input.focus(); input.select();
    const saveName = () => {
        saveStateForUndo(); layer.name = input.value.trim() || `Layer ${getLayerIndex(layerId) + 1}`;
        renderLayersList();
    };
    input.onblur = saveName; input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); else if (e.key === 'Escape') { input.value = layer.name; input.blur(); renderLayersList(); }};
}

function toggleLayerVisibility(layerId) {
    saveStateForUndo(); const layer = layers.find(l => l.id === layerId);
    if (layer) layer.isVisible = !layer.isVisible; renderLayersList(); drawScene();
}

function deleteLayer(layerId) {
    if (layers.length <= 1) { showModal("Action Denied", "Cannot delete the last layer."); return; }
    const layerToDelete = layers.find(l => l.id === layerId); if (!layerToDelete) return;
    showModal("Confirm Deletion", `Delete layer "${layerToDelete.name}"?`, 
    [{ text: "Delete", class: 'btn-danger', action: () => {
        saveStateForUndo(); 
        const deletedLayerIndex = getLayerIndex(layerId);
        layers = layers.filter(l => l.id !== layerId);
        if (activeLayerId === layerId) {
            if (layers.length > 0) {
                 setActiveLayer(layers[Math.max(0, deletedLayerIndex -1)].id);
            } else {
                activeLayerId = null; 
            }
        }
        renderLayersList(); drawScene(); closeModal(messageModal);
    }},{ text: "Cancel", class: 'btn', action: () => closeModal(messageModal) }], true);
}

function moveLayer(layerId, direction) {
    saveStateForUndo(); const index = getLayerIndex(layerId); if (index === -1) return;
    if (direction === 'up' && index < layers.length - 1) [layers[index], layers[index + 1]] = [layers[index + 1], layers[index]];
    else if (direction === 'down' && index > 0) [layers[index], layers[index - 1]] = [layers[index - 1], layers[index]];
    renderLayersList(); drawScene();
}

function updateAnimationSlidersForActiveLayer() {
    const activeLayer = getActiveLayer();
    if (activeLayer) {
        for (const key in animationSliders) {
            const setting = activeLayer.animationSettings[key];
            if (setting !== undefined) {
                animationSliders[key].slider.value = setting;
                animationSliders[key].valueEl.textContent = setting + (animationSliders[key].suffix || '');
            }
        }
    } else {
         for (const key in animationSliders) {
            animationSliders[key].slider.value = animationSliders[key].slider.defaultValue || 0;
            animationSliders[key].valueEl.textContent = (animationSliders[key].slider.defaultValue || 0) + (animationSliders[key].suffix || '');
         }
    }
}

Object.values(animationSliders).forEach(item => {
    item.slider.addEventListener('input', (e) => {
        const activeLayer = getActiveLayer();
        if (activeLayer) {
            const key = Object.keys(animationSliders).find(k => animationSliders[k].slider === e.target);
            if (key) {
                saveStateForUndo();
                activeLayer.animationSettings[key] = parseFloat(e.target.value);
                item.valueEl.textContent = e.target.value + (item.suffix || '');
            }
        }
    });
});

function getCanvasPointerPos(event) { 
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left), y: (event.clientY - rect.top) };
}

function handlePointerDown(event) {
    if (!event.isPrimary || (currentTool !== 'pen' && currentTool !== 'eraser')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const activeLayer = getActiveLayer();
    if (!activeLayer || !activeLayer.isVisible) return; 
    saveStateForUndo(); 
    isDrawing = true;
    canvas.setPointerCapture(event.pointerId);
    const { x, y } = getCanvasPointerPos(event);
    if (currentTool === 'pen') {
        activeLayer.strokes.push({
            id: generateLayerId(), points: [{ x: x, y: y }], color: currentStrokeColor, 
            size: currentStrokeSize, tool: currentTool, originalSize: currentStrokeSize, birthTime: time, 
        });
    }
    lastX = x; lastY = y; 
}

function isPointInCircle(px, py, cx, cy, radius) {
    const dx = px - cx; const dy = py - cy;
    return dx * dx + dy * dy <= radius * radius;
}

function handlePointerMove(event) {
    if (!isDrawing || !event.isPrimary) return;
    const activeLayer = getActiveLayer();
    if (!activeLayer || !activeLayer.isVisible) return;
    const events = (typeof event.getCoalescedEvents === 'function') ? event.getCoalescedEvents() : [event];
    for (const coalescedEvent of events) {
        const { x, y } = getCanvasPointerPos(coalescedEvent); 
        if (currentTool === 'eraser') {
            const eraserRadiusWorld = currentStrokeSize / 2; 
            let erasedSomething = false;
            for (let i = activeLayer.strokes.length - 1; i >= 0; i--) {
                const stroke = activeLayer.strokes[i];
                if (stroke.tool === 'pen') { 
                    let hit = false;
                    for (const p of stroke.points) {
                        if (isPointInCircle(p.x, p.y, x, y, eraserRadiusWorld)) {
                            hit = true; break;
                        }
                    }
                    if (hit) { activeLayer.strokes.splice(i, 1); erasedSomething = true; }
                }
            }
            if (erasedSomething) drawScene();
            lastX = x; lastY = y; 
        } else if (currentTool === 'pen') {
            const currentPath = activeLayer.strokes[activeLayer.strokes.length - 1];
            if (!currentPath || currentPath.tool !== 'pen') { isDrawing = false; return; }
            currentPath.points.push({ x: x, y: y });
            ctx.save();
            ctx.globalAlpha = activeLayer.opacity; 
            ctx.globalCompositeOperation = 'source-over';
            ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(x, y);         
            ctx.strokeStyle = currentPath.color; ctx.lineWidth = currentPath.size;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
            ctx.restore();
            lastX = x; lastY = y; 
        }
    }
}

function handlePointerUp(event) { 
    if (!event.isPrimary) return;
    if (isDrawing) {
        isDrawing = false;
        canvas.releasePointerCapture(event.pointerId);
        if(currentTool === 'eraser') { drawScene(); }
    }
}

canvas.addEventListener('pointerdown', handlePointerDown);
canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('pointerup', handlePointerUp);
canvas.addEventListener('pointerleave', handlePointerUp);
canvas.addEventListener('pointercancel', handlePointerUp);

penToolBtn.addEventListener('click', () => { currentTool = 'pen'; setActiveToolButton(penToolBtn); });
eraserToolBtn.addEventListener('click', () => { currentTool = 'eraser'; setActiveToolButton(eraserToolBtn); });
strokeSizeSlider.addEventListener('input', (e) => { currentStrokeSize = parseInt(e.target.value); strokeSizeValue.textContent = currentStrokeSize; updateCanvasCursor(); });
strokeColorPicker.addEventListener('input', (e) => { currentStrokeColor = e.target.value; });

clearActiveLayerBtn.addEventListener('click', () => { 
    const activeLayer = getActiveLayer();
    if (!activeLayer || activeLayer.strokes.length === 0) { showModal("Clear Layer", "Active layer is already empty."); return; }
    showModal("Confirm Clear Layer", `Clear all strokes from layer "${activeLayer.name}"?`,
    [{text: "Clear Layer", class: 'btn-danger', action: () => { saveStateForUndo(); activeLayer.strokes = []; drawScene(); closeModal(messageModal); }},
     {text: "Cancel", class: 'btn', action: () => closeModal(messageModal)}], true);
});

clearAllLayersBtn.addEventListener('click', () => {
    if (layers.every(l => l.strokes.length === 0)) { showModal("Clear All Layers", "All layers are already empty."); return; }
    showModal("Confirm Clear All", "Clear strokes from ALL layers?",
    [{text: "Clear All", class: 'btn-danger', action: () => { saveStateForUndo(); layers.forEach(layer => layer.strokes = []); drawScene(); closeModal(messageModal); }},
     {text: "Cancel", class: 'btn', action: () => closeModal(messageModal)}], true);
});

undoBtn.addEventListener('click', () => {
    if (undoStack.length > 0) {
        redoStack.push({ layers: JSON.parse(JSON.stringify(layers)), activeLayerId: activeLayerId, viewTransform: { ...viewTransform } });
        const prevState = undoStack.pop();
        layers = prevState.layers;
        activeLayerId = prevState.activeLayerId;
        layers.forEach(l => l.isActive = (l.id === activeLayerId));
        renderLayersList(); updateAnimationSlidersForActiveLayer(); drawScene(); updateUndoRedoButtons();
    }
});

redoBtn.addEventListener('click', () => {
    if (redoStack.length > 0) {
        undoStack.push({ layers: JSON.parse(JSON.stringify(layers)), activeLayerId: activeLayerId, viewTransform: { ...viewTransform } });
        const nextState = redoStack.pop();
        layers = nextState.layers;
        activeLayerId = nextState.activeLayerId;
        layers.forEach(l => l.isActive = (l.id === activeLayerId));
        renderLayersList(); updateAnimationSlidersForActiveLayer(); drawScene(); updateUndoRedoButtons();
    }
});

function drawScene(isExporting = false, exportTimeOverride = null) {
    const currentTime = isExporting ? exportTimeOverride : time;
    const targetCtx = ctx; 
    const currentCanvasWidth = isExporting ? EXPORT_WIDTH : canvas.width;
    const currentCanvasHeight = isExporting ? EXPORT_HEIGHT : canvas.height;

    if (canvas.width !== currentCanvasWidth || canvas.height !== currentCanvasHeight) {
        canvas.width = currentCanvasWidth; canvas.height = currentCanvasHeight;
    }
    
    targetCtx.fillStyle = '#FFFFFF'; 
    targetCtx.fillRect(0, 0, currentCanvasWidth, currentCanvasHeight);

    layers.forEach(layer => {
        if (!layer.isVisible || layer.strokes.length === 0) return;
        targetCtx.save(); 
        targetCtx.globalAlpha = layer.opacity; 
        targetCtx.globalCompositeOperation = 'source-over'; // Simplified: no blend modes

        const animSettings = layer.animationSettings;
        const animSpeed = parseFloat(animSettings.animationSpeed); 
        const wiggleAmp = parseFloat(animSettings.wiggleIntensity);
        const breathAmount = parseFloat(animSettings.breathingStroke);
        const shakeAmount = parseFloat(animSettings.shakeIntensity);

        layer.strokes.forEach(stroke => {
            if (!stroke.points || stroke.points.length < 1) return;
            targetCtx.save(); 
            if (shakeAmount > 0) { 
                const shakeX = (Math.random() - 0.5) * shakeAmount * animSpeed; 
                const shakeY = (Math.random() - 0.5) * shakeAmount * animSpeed;
                targetCtx.translate(shakeX, shakeY);
            }
            let currentDynamicSize = stroke.originalSize;
            if (breathAmount > 0) {
                currentDynamicSize = stroke.originalSize + Math.sin(currentTime * 0.1 * animSpeed + stroke.birthTime) * breathAmount;
                currentDynamicSize = Math.max(1, currentDynamicSize);
            }
            if (stroke.tool === 'pen') {
                targetCtx.beginPath();
                if (stroke.points.length === 1) { 
                    const p = stroke.points[0];
                    const radius = currentDynamicSize / 2;
                    targetCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                    targetCtx.fillStyle = stroke.color; 
                    targetCtx.fill();
                } else { 
                    for (let i = 0; i < stroke.points.length; i++) {
                        let p = { ...stroke.points[i] }; 
                        if (wiggleAmp > 0 && i > 0) {
                            const prevP = stroke.points[i-1]; const dx = p.x - prevP.x; const dy = p.y - prevP.y;
                            const angle = Math.atan2(dy, dx); const normalAngle = angle + Math.PI / 2; 
                            const wiggleOffset = Math.sin(currentTime * 0.1 * animSpeed + i * 0.5 + stroke.birthTime * 0.01) * wiggleAmp;
                            p.x += Math.cos(normalAngle) * wiggleOffset; p.y += Math.sin(normalAngle) * wiggleOffset;
                        }
                        if (i === 0) targetCtx.moveTo(p.x, p.y); else targetCtx.lineTo(p.x, p.y);
                    }
                    targetCtx.strokeStyle = stroke.color;
                    targetCtx.lineWidth = currentDynamicSize;
                    targetCtx.lineCap = 'round'; targetCtx.lineJoin = 'round'; 
                    targetCtx.stroke();
                }
            }
            targetCtx.restore(); 
        });
        targetCtx.restore(); 
    });
}

function animate() { time += 1; drawScene(); animationFrameId = requestAnimationFrame(animate); }

saveBtn.addEventListener('click', () => {
    if (layers.length === 0 || layers.every(l => l.strokes.length === 0)) { showModal("Save Sketch", "Canvas empty."); return; }
    const dataToSave = { layers: layers, activeLayerId: activeLayerId, WORLD_WIDTH, WORLD_HEIGHT, viewTransform }; 
    const jsonData = JSON.stringify(dataToSave); const blob = new Blob([jsonData], { type: 'application/octet-stream' }); 
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-'); a.download = `drawerz_sketch_${timestamp}.drz`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showModal("Save Sketch", "Sketch saved as .drz file!");
});

loadInput.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const fileName = file.name.toLowerCase(); const fileExtension = fileName.split('.').pop();
    if (fileExtension === 'drz') {
        loadingIndicator.classList.remove('hidden'); if(loadingText) loadingText.textContent = "Loading .drz sketch...";
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.layers && Array.isArray(data.layers)) {
                    saveStateForUndo(); 
                    layers = data.layers.map(loadedLayer => {
                        const defaultAnim = {};
                        for (const key in animationSliders) defaultAnim[key] = parseFloat(animationSliders[key].slider.defaultValue || 0);
                        return createNewLayer( // Use createNewLayer to ensure all properties are set correctly
                            loadedLayer.name || 'Loaded Layer',
                            loadedLayer.strokes || [],
                            { ...defaultAnim, ...(loadedLayer.animationSettings || {}) },
                            loadedLayer.isVisible !== undefined ? loadedLayer.isVisible : true,
                            loadedLayer.opacity !== undefined ? loadedLayer.opacity : 1
                        );
                    });
                    if (data.activeLayerId && layers.find(l => l.id === data.activeLayerId)) activeLayerId = data.activeLayerId;
                    else if (layers.length > 0) activeLayerId = layers[layers.length - 1].id;
                    else activeLayerId = null;
                    layers.forEach(l => l.isActive = (l.id === activeLayerId));
                    renderLayersList(); updateAnimationSlidersForActiveLayer(); setupCanvasDimensions();
                    showModal("Load Sketch", "Sketch loaded!");
                } else showModal("Load Error", "Invalid .drz file. Missing 'layers' data.");
            } catch (error) { console.error("Load error:", error); showModal("Load Error", "Could not load sketch. " + error.message);
            } finally { loadingIndicator.classList.add('hidden'); loadInput.value = ''; }
        };
        reader.onerror = () => { showModal("Load Error", "Error reading file."); loadingIndicator.classList.add('hidden'); loadInput.value = ''; };
        reader.readAsText(file);
    } else if (fileExtension === 'svg') {
        loadingIndicator.classList.remove('hidden'); if(loadingText) loadingText.textContent = "Parsing SVG...";
        const reader = new FileReader();
        reader.onload = (event) => {
            try { parseAndAddSVG(event.target.result); showModal("SVG Import", "SVG content imported to active layer.");
            } catch (error) { console.error("SVG Parse error:", error); showModal("SVG Import Error", "Could not parse SVG. " + error.message);
            } finally { loadingIndicator.classList.add('hidden'); loadInput.value = ''; }
        };
        reader.onerror = () => { showModal("Load Error", "Error reading SVG file."); loadingIndicator.classList.add('hidden'); loadInput.value = ''; };
        reader.readAsText(file);
    } else if (fileExtension === 'psd' || fileExtension === 'clip') { 
         showModal("Import Not Supported", `Direct import of <strong>.${fileExtension.toUpperCase()}</strong> files is not supported. Please export as SVG.`);
        loadInput.value = ''; 
    } else { showModal("Unsupported File", "Please load a .drz or .svg file."); loadInput.value = ''; }
});

function parseAndAddSVG(svgString) {
    const activeLayer = getActiveLayer();
    if (!activeLayer) {
        showModal("SVG Import Error", "No active layer to import SVG content into. Please add or select a layer.");
        return;
    }
    saveStateForUndo();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
    const svgElement = svgDoc.documentElement;
    let vbX=0, vbY=0, vbW=parseFloat(svgElement.getAttribute('width')), vbH=parseFloat(svgElement.getAttribute('height'));
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
        const parts = viewBox.split(/[\s,]+/);
        vbX = parseFloat(parts[0]) || 0; vbY = parseFloat(parts[1]) || 0;
        vbW = parseFloat(parts[2]) || vbW; vbH = parseFloat(parts[3]) || vbH;
    }
    const scaleX = WORLD_WIDTH / vbW; const scaleY = WORLD_HEIGHT / vbH;
    const globalScale = Math.min(scaleX, scaleY) * 0.9; 
    function transformPoint(x, y) {
        return {
            x: (x - vbX) * globalScale + (WORLD_WIDTH - vbW * globalScale) / 2,
            y: (y - vbY) * globalScale + (WORLD_HEIGHT - vbH * globalScale) / 2
        };
    }
    let importedStrokesCount = 0;
    function parsePathD(d) {
        const points = []; if (!d) return points;
        const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
        let currentX = 0, currentY = 0; let subPathStart = null;
        commands.forEach(cmdStr => {
            const type = cmdStr[0];
            const args = (cmdStr.substring(1).match(/-?\d*\.?\d+/g) || []).map(parseFloat);
            if (type === 'M') { 
                currentX = args[0]; currentY = args[1]; points.push(transformPoint(currentX, currentY));
                subPathStart = {x: currentX, y: currentY};
                for (let i = 2; i < args.length; i += 2) { currentX = args[i]; currentY = args[i+1]; points.push(transformPoint(currentX, currentY)); }
            } else if (type === 'L') { 
                 for (let i = 0; i < args.length; i += 2) { currentX = args[i]; currentY = args[i+1]; points.push(transformPoint(currentX, currentY)); }
            } else if (type === 'Z' || type === 'z') { 
                if (subPathStart && points.length > 0) {
                    const lastPoint = points[points.length-1];
                    const firstTransformed = transformPoint(subPathStart.x, subPathStart.y);
                    if(Math.abs(lastPoint.x - firstTransformed.x) > 0.1 || Math.abs(lastPoint.y - firstTransformed.y) > 0.1) { points.push(firstTransformed); }
                }
                subPathStart = null; 
            }
        });
        return points;
    }
    svgDoc.querySelectorAll('path, line, rect, circle, ellipse, polyline, polygon').forEach(el => {
        let points = [];
        const strokeColor = el.getAttribute('stroke') || currentStrokeColor;
        let strokeWidth = parseFloat(el.getAttribute('stroke-width')) || currentStrokeSize;
        if (isNaN(strokeWidth) || strokeWidth <= 0) strokeWidth = currentStrokeSize;
        const tagName = el.tagName.toLowerCase();
        if (tagName === 'path') { points = parsePathD(el.getAttribute('d')); } 
        else if (tagName === 'line') { points.push(transformPoint(parseFloat(el.getAttribute('x1')), parseFloat(el.getAttribute('y1')))); points.push(transformPoint(parseFloat(el.getAttribute('x2')), parseFloat(el.getAttribute('y2')))); } 
        else if (tagName === 'rect') { const x = parseFloat(el.getAttribute('x')); const y = parseFloat(el.getAttribute('y')); const w = parseFloat(el.getAttribute('width')); const h = parseFloat(el.getAttribute('height')); points.push(transformPoint(x, y)); points.push(transformPoint(x + w, y)); points.push(transformPoint(x + w, y + h)); points.push(transformPoint(x, y + h)); points.push(transformPoint(x, y)); } 
        else if (tagName === 'circle') { const cx = parseFloat(el.getAttribute('cx')); const cy = parseFloat(el.getAttribute('cy')); const r = parseFloat(el.getAttribute('r')); for (let i = 0; i <= 360; i += 15) { const angle = i * Math.PI / 180; points.push(transformPoint(cx + r * Math.cos(angle), cy + r * Math.sin(angle))); } } 
        else if (tagName === 'ellipse') { const cx = parseFloat(el.getAttribute('cx')); const cy = parseFloat(el.getAttribute('cy')); const rx = parseFloat(el.getAttribute('rx')); const ry = parseFloat(el.getAttribute('ry')); for (let i = 0; i <= 360; i += 15) { const angle = i * Math.PI / 180; points.push(transformPoint(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle))); } } 
        else if (tagName === 'polyline' || tagName === 'polygon') { const ptsStr = el.getAttribute('points').split(/[\s,]+/); for (let i = 0; i < ptsStr.length; i += 2) { points.push(transformPoint(parseFloat(ptsStr[i]), parseFloat(ptsStr[i+1]))); } if (tagName === 'polygon' && points.length > 0) { points.push({...points[0]}); } }
        if (points.length > 0) {
            activeLayer.strokes.push({ id: generateLayerId(), points: points, color: strokeColor, size: strokeWidth, tool: 'pen', originalSize: strokeWidth, birthTime: time });
            importedStrokesCount++;
        }
    });
    if (importedStrokesCount > 0) drawScene();
    console.log(`Imported ${importedStrokesCount} shapes/paths from SVG.`);
}

async function initializeFFmpeg() {
    if (!ffmpeg) { 
         ffmpeg = createFFmpeg({ log: true, corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js' });
    }
    if (!ffmpeg.isLoaded()) {
        loadingText.textContent = "Loading FFmpeg library (~30MB)...";
        loadingIndicator.classList.remove('hidden'); 
        await ffmpeg.load();
    }
}

async function checkAndLoadFFmpeg() {
    if (typeof SharedArrayBuffer === 'undefined') {
        let sabMessage = "<p>MP4 export uses FFmpeg.wasm, which requires <code>SharedArrayBuffer</code>.</p>" +
                         "<p>This feature is often disabled by browsers unless the page is served with specific HTTP headers (COOP & COEP).</p>";
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            sabMessage += "<p>A Service Worker is active, which attempts to set these headers. If <code>SharedArrayBuffer</code> is still unavailable, please try **reloading the page** (sometimes a hard refresh: Ctrl+Shift+R or Cmd+Shift+R is needed). If the issue persists, your hosting environment or browser settings might be preventing it.</p>";
        } else if ('serviceWorker' in navigator) {
            sabMessage += "<p>A Service Worker is attempting to register to enable this. This might be its first activation. Please **reload the page** and try exporting again. If MP4 export still fails, the Service Worker might not have activated correctly or your environment has restrictions.</p>";
        } else {
            sabMessage += "<p>Your browser does not support Service Workers, or support is disabled. Service Workers are used here to attempt to set the required headers on this hosting platform.</p>";
        }
        sabMessage += "<p>For MP4 export to work, the page needs to be served with:<br>" +
                      "<code>Cross-Origin-Opener-Policy: same-origin</code><br>" +
                      "<code>Cross-Origin-Embedder-Policy: require-corp</code></p>";
        showModal("MP4 Export Prerequisite Missing", sabMessage);
        return false;
    }
    try { await initializeFFmpeg(); } 
    catch (err) { console.error("FFmpeg load error:", err); showModal("FFmpeg Load Error", "Failed to load FFmpeg components. MP4 export is unavailable. Error: " + err.message); loadingIndicator.classList.add('hidden'); return false; }
    return true;
}

exportMp4Btn.addEventListener('click', async () => { 
    if (layers.every(l => !l.isVisible || l.strokes.length === 0)) { showModal("Export Error", "No visible content to export."); return; }
    const ffmpegReady = await checkAndLoadFFmpeg();
    if (!ffmpegReady) { loadingIndicator.classList.add('hidden'); return; }
    const globalExportAnimSpeedFactor = parseFloat(animationSliders.animationSpeed.slider.value);
    if (globalExportAnimSpeedFactor <= 0) { showModal("Export Warning", "Global Animation Speed is zero or less. The exported video will not show animation."); }
    loadingIndicator.classList.remove('hidden'); loadingText.textContent = "Preparing video export...";
    const frameRate = 30; const durationSeconds = 15; const totalFrames = frameRate * durationSeconds;
    const liveAnimationTimeAtStart = time; let exportRenderTime = liveAnimationTimeAtStart; 
    const timeStepPerVideoFrame = globalExportAnimSpeedFactor * (60 / frameRate);
    if (animationFrameId) cancelAnimationFrame(animationFrameId); 
    let currentFrame = 0; const frameFileNames = [];
    canvas.width = EXPORT_WIDTH; canvas.height = EXPORT_HEIGHT;
    async function renderAndSaveFrame() {
        if (currentFrame >= totalFrames) { await compileVideo(); return; }
        loadingText.textContent = `Rendering frame ${currentFrame + 1} of ${totalFrames}...`;
        if(canvas.width !== EXPORT_WIDTH || canvas.height !== EXPORT_HEIGHT) { canvas.width = EXPORT_WIDTH; canvas.height = EXPORT_HEIGHT; }
        drawScene(true, exportRenderTime); 
        const frameName = `frame${String(currentFrame).padStart(4, '0')}.png`; frameFileNames.push(frameName);
        try {
            const dataUrl = canvas.toDataURL('image/png');
            const blob = await (await fetch(dataUrl)).blob();
            const arrayBuffer = await blob.arrayBuffer();
            ffmpeg.FS('writeFile', frameName, new Uint8Array(arrayBuffer));
        } catch (frameError) {
            console.error(`Error processing frame ${frameName}:`, frameError); showModal("Frame Processing Error", `Failed to process frame ${currentFrame + 1}. Export aborted.`);
            frameFileNames.forEach(name => { try { ffmpeg.FS('unlink', name); } catch(e){} });
            canvas.width = WORLD_WIDTH; canvas.height = WORLD_HEIGHT; loadingIndicator.classList.add('hidden');
            time = liveAnimationTimeAtStart; animate(); return;
        }
        exportRenderTime += timeStepPerVideoFrame; currentFrame++; setTimeout(renderAndSaveFrame, 1); 
    }
    async function compileVideo() {
        loadingText.textContent = "Encoding MP4... This may take a while.";
        try {
            await ffmpeg.run('-r', String(frameRate), '-i', 'frame%04d.png', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', 'output.mp4');
            const data = ffmpeg.FS('readFile', 'output.mp4');
            const blob = new Blob([data.buffer], { type: 'video/mp4' }); const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url;
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-'); 
            a.download = `drawerz_animation_${timestamp}.mp4`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            showModal("Export Complete", "Animation exported as MP4!");
        } catch (error) { console.error("FFmpeg run error:", error); showModal("FFmpeg Export Error", "Error during video encoding: " + error.message);
        } finally {
            frameFileNames.forEach(name => { try { ffmpeg.FS('unlink', name); } catch(e){} });
            try { ffmpeg.FS('unlink', 'output.mp4'); } catch(e){}
            canvas.width = WORLD_WIDTH; canvas.height = WORLD_HEIGHT;
            loadingIndicator.classList.add('hidden'); time = liveAnimationTimeAtStart; animate(); 
        }
    }
    renderAndSaveFrame(); 
});

exportGifBtn.addEventListener('click', async () => {
    if (layers.every(l => !l.isVisible || l.strokes.length === 0)) { showModal("Export Error", "No visible content to export."); return; }
    loadingIndicator.classList.remove('hidden'); loadingText.textContent = "Preparing GIF export...";
    const frameRate = 10; const durationSeconds = 15; const totalFrames = frameRate * durationSeconds; const delay = 1000 / frameRate; 
    const liveAnimationTimeAtStart = time; let exportRenderTime = liveAnimationTimeAtStart;
    const globalExportAnimSpeedFactor = parseFloat(animationSliders.animationSpeed.slider.value);
     if (globalExportAnimSpeedFactor <= 0) { showModal("Export Warning", "Global Animation Speed is zero or less. The exported GIF will not be animated."); }
    const timeStepPerVideoFrame = globalExportAnimSpeedFactor * (60 / frameRate);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    const gif = new GIF({ workers: 2, quality: 10, workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js', width: EXPORT_WIDTH, height: EXPORT_HEIGHT, background: '#FFF', transparent: null });
    canvas.width = EXPORT_WIDTH; canvas.height = EXPORT_HEIGHT;
    let currentFrame = 0;
    function addGifFrame() {
        if (currentFrame >= totalFrames) { gif.render(); return; }
        loadingText.textContent = `Rendering GIF frame ${currentFrame + 1} of ${totalFrames}...`;
        if(canvas.width !== EXPORT_WIDTH || canvas.height !== EXPORT_HEIGHT) { canvas.width = EXPORT_WIDTH; canvas.height = EXPORT_HEIGHT; }
        drawScene(true, exportRenderTime);
        gif.addFrame(canvas, { copy: true, delay: delay });
        exportRenderTime += timeStepPerVideoFrame; currentFrame++; setTimeout(addGifFrame, 10); 
    }
    gif.on('finished', function(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        a.download = `drawerz_animation_${timestamp}.gif`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        canvas.width = WORLD_WIDTH; canvas.height = WORLD_HEIGHT;
        loadingIndicator.classList.add('hidden');
        showModal("Export Complete", "Animation exported as GIF!");
        time = liveAnimationTimeAtStart; animate();
    });
    gif.on('progress', function(p) { loadingText.textContent = `Encoding GIF: ${Math.round(p * 100)}%`; });
    addGifFrame();
});

function initializeApp() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js', { scope: './' }) 
            .then(registration => {
                console.log('Drawerz Service Worker: Registered with scope:', registration.scope);
            }).catch(error => {
                console.error('Drawerz Service Worker: Registration failed:', error);
            });
        });
    }
    loadingIndicator.classList.add('hidden'); messageModal.classList.add('hidden');
    setActiveToolButton(penToolBtn); 
    strokeSizeValue.textContent = strokeSizeSlider.value;
    if (layers.length === 0) { const initialLayer = createNewLayer(1); layers.push(initialLayer); setActiveLayer(initialLayer.id); }
    else setActiveLayer(layers.find(l => l.isActive)?.id || (layers.length > 0 ? layers[0].id : null) ); 
    setupCanvasDimensions();
    updateAnimationSlidersForActiveLayer(); 
    updateUndoRedoButtons(); 
    animate(); 
    updateCanvasCursor();
}

addLayerBtn.addEventListener('click', addLayer);
document.addEventListener('keydown', function(e) {
    const activeEl = document.activeElement;
    const isInputFocused = (activeEl && (activeEl.tagName.toLowerCase() === 'input' && activeEl.type !== 'range') || activeEl.tagName.toLowerCase() === 'textarea');
    if (isInputFocused) return; 
    let prevented = true; 
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') saveBtn.click();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') document.getElementById('loadInput').click();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') exportMp4Btn.click();
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Delete') { clearAllLayersBtn.click(); } 
    else if ((e.ctrlKey || e.metaKey) && e.code === 'Delete') { clearActiveLayerBtn.click(); } 
    else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { undoBtn.click(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { redoBtn.click(); }
    else if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) penToolBtn.click();
    else if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) eraserToolBtn.click();
    else prevented = false;
    if (prevented) e.preventDefault();
});
initializeApp();