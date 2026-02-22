// Graph constants
const MAX_PCA_DIMENSIONS = 50; // Limit dimensions for performance
const POWER_ITERATION_COUNT = 100; // More iterations for better convergence
export const POINT_RADIUS = 4; // Radius of points on graph
export const HOVER_RADIUS = 6; // Radius for hover detection

// Returns a seeded pseudo-random number generator (LCG algorithm).
// Calling the returned function repeatedly produces values in [0, 1).
// Using a fixed seed ensures reproducible results across page loads.
export function seededRandom(seed) {
    let state = seed;
    return function() {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

// Returns {scaleX, scaleY} functions that map 2D embedding coordinates
// to canvas pixel positions, fitting all points within the padded area.
// extraPoints are optionally included so the query point is always in range.
export function getScalingFunctions(reducedEmbeddings, width, height, padding, extraPoints) {
    const allPoints = extraPoints ? [...reducedEmbeddings, ...extraPoints] : reducedEmbeddings;
    const xValues = allPoints.map(p => p.coords[0]);
    const yValues = allPoints.map(p => p.coords[1]);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);

    const xRange = xMax - xMin;
    const yRange = yMax - yMin;

    return {
        scaleX: (x) => xRange === 0 ? width / 2 : padding + ((x - xMin) / xRange) * (width - 2 * padding),
        scaleY: (y) => yRange === 0 ? height / 2 : height - padding - ((y - yMin) / yRange) * (height - 2 * padding)
    };
}

// Reduces high-dimensional embedding vectors to targetDimensions (default 2)
// using PCA via power iteration on the covariance matrix.
// Returns { projected, pcaMean, pcaComponents } so callers can project new points later.
export function performPCA(vectors, targetDimensions = 2) {
    // Reset PRNG for deterministic results across multiple PCA calls
    const localPrng = seededRandom(42);

    const n = vectors.length;
    const d = vectors[0].length;

    // Center the data
    const mean = new Array(d).fill(0);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < d; j++) {
            mean[j] += vectors[i][j];
        }
    }
    for (let j = 0; j < d; j++) {
        mean[j] /= n;
    }

    const centered = vectors.map(v => v.map((val, idx) => val - mean[idx]));

    // Compute covariance matrix (using a subset of dimensions for performance)
    const maxDims = Math.min(MAX_PCA_DIMENSIONS, d);
    const cov = Array.from({ length: maxDims }, () => Array(maxDims).fill(0));

    for (let i = 0; i < maxDims; i++) {
        for (let j = i; j < maxDims; j++) {
            let sum = 0;
            for (let k = 0; k < n; k++) {
                sum += centered[k][i] * centered[k][j];
            }
            cov[i][j] = sum / (n - 1);
            cov[j][i] = cov[i][j];
        }
    }

    // Power iteration for first 2 principal components
    const components = [];
    for (let comp = 0; comp < targetDimensions; comp++) {
        let v = Array(maxDims).fill(0).map(() => localPrng() - 0.5);

        // Normalize
        let norm = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
        v = v.map(val => val / norm);

        // Deflate previous components
        for (let prevComp of components) {
            const dot = v.reduce((sum, val, idx) => sum + val * prevComp[idx], 0);
            v = v.map((val, idx) => val - dot * prevComp[idx]);
        }

        // Power iteration
        for (let iter = 0; iter < POWER_ITERATION_COUNT; iter++) {
            const Av = Array(maxDims).fill(0);
            for (let i = 0; i < maxDims; i++) {
                for (let j = 0; j < maxDims; j++) {
                    Av[i] += cov[i][j] * v[j];
                }
            }

            // Deflate previous components
            for (let prevComp of components) {
                const dot = Av.reduce((sum, val, idx) => sum + val * prevComp[idx], 0);
                Av.forEach((val, idx) => Av[idx] = val - dot * prevComp[idx]);
            }

            norm = Math.sqrt(Av.reduce((sum, val) => sum + val * val, 0));
            v = Av.map(val => val / norm);
        }

        components.push(v);
    }

    // Project data onto principal components
    const projected = centered.map(point => {
        return components.map(comp => {
            let sum = 0;
            for (let i = 0; i < maxDims; i++) {
                sum += point[i] * comp[i];
            }
            return sum;
        });
    });

    return { projected, pcaMean: mean, pcaComponents: components };
}

// Projects a single new vector into the PCA space computed by performPCA.
// pcaMean and pcaComponents are returned by performPCA; returns null if either is missing.
// Used to place the live query point on the existing graph without re-running PCA.
export function projectIntoPCA(vector, pcaMean, pcaComponents) {
    if (!pcaMean || !pcaComponents) return null;
    const maxDims = Math.min(MAX_PCA_DIMENSIONS, vector.length, pcaMean.length);
    const centered = new Array(maxDims);
    for (let i = 0; i < maxDims; i++) {
        centered[i] = vector[i] - pcaMean[i];
    }
    return pcaComponents.map(comp => {
        let sum = 0;
        for (let i = 0; i < maxDims; i++) {
            sum += centered[i] * comp[i];
        }
        return sum;
    });
}

// Maps a document filename to a category color based on its numeric prefix.
// Prefixes 1-5 → red (Fruits), 6-10 → cyan (SIMD), 11+ → green (Mathematics).
export function getColorForDocument(filename) {
    const prefix = parseInt(filename.split('-')[0]);
    if (prefix >= 1 && prefix <= 5) {
        return '#ff6b6b'; // Red for fruits (01-05)
    } else if (prefix >= 6 && prefix <= 10) {
        return '#4ecdc4'; // Cyan for SIMD (06-10)
    } else {
        return '#95e1d3'; // Green for mathematics (11-20)
    }
}

// Renders the 2D PCA scatter plot onto the provided canvas element.
// Draws document points colored by category and, if present, the query point as a gold star.
// Also draws PC1/PC2 axis labels. Called on load, search, and window resize.
export function drawEmbeddingsGraph(canvas, reducedEmbeddings, queryPoint) {
    const ctx = canvas.getContext('2d');

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (reducedEmbeddings.length === 0) return;

    // Include query point in scaling if present
    const extraPoints = queryPoint ? [queryPoint] : [];

    // Get scaling functions
    const { scaleX, scaleY } = getScalingFunctions(reducedEmbeddings, width, height, padding, extraPoints);

    // Draw axes
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw points
    reducedEmbeddings.forEach((point) => {
        const x = scaleX(point.coords[0]);
        const y = scaleY(point.coords[1]);
        const color = point.color;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fill();

        // Draw border
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
    });

    // Draw query point as a star shape
    if (queryPoint) {
        const qx = scaleX(queryPoint.coords[0]);
        const qy = scaleY(queryPoint.coords[1]);
        const outerRadius = 8;
        const innerRadius = 4;
        const spikes = 5;

        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (Math.PI / 2 * 3) + (i * Math.PI / spikes);
            const sx = qx + Math.cos(angle) * radius;
            const sy = qy + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw label
        ctx.fillStyle = '#333';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('Query', qx + 12, qy + 4);
    }

    // Add labels
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.fillText('PC1', width - padding + 5, height - padding + 5);
    ctx.fillText('PC2', padding - 5, padding - 10);
}

// Populates the graph legend element with color-coded category labels
// (Fruits, SIMD, Mathematics, Query) by injecting HTML into the provided element.
export function setupGraphLegend(graphLegend) {
    const categories = [
        { name: 'Fruits', color: '#ff6b6b' },
        { name: 'SIMD', color: '#4ecdc4' },
        { name: 'Mathematics', color: '#95e1d3' },
        { name: 'Query', color: '#FFD700' }
    ];

    graphLegend.innerHTML = categories.map(cat => `
        <div class="legend-item">
            <div class="legend-color" style="background-color: ${cat.color}"></div>
            <span>${cat.name}</span>
        </div>
    `).join('');
}

// Toggles the embeddings graph panel between shown and hidden states,
// updating the button label and redrawing the graph when made visible.
// Returns the new graphVisible boolean value.
export function toggleGraph(graphVisible, graphSection, toggleGraphButton, reducedEmbeddings, canvas, queryPoint) {
    const newVisible = !graphVisible;
    if (newVisible) {
        graphSection.classList.add('visible');
        toggleGraphButton.textContent = 'Hide Graph';
        if (reducedEmbeddings.length > 0) {
            drawEmbeddingsGraph(canvas, reducedEmbeddings, queryPoint);
        }
    } else {
        graphSection.classList.remove('visible');
        toggleGraphButton.textContent = 'Show Graph';
    }
    return newVisible;
}

// Runs PCA on all loaded embeddings to produce 2D coordinates,
// builds the reducedEmbeddings array with color metadata, sets up the legend,
// and renders the graph. Called once after embeddings are fully loaded.
// Returns { reducedEmbeddings, pcaMean, pcaComponents } for use by callers.
export function initializeGraph(embeddings, updateStatus, canvas, graphSection, graphLegend, graphToggleContainer, toggleGraphButton) {
    if (embeddings.length === 0) return null;

    updateStatus('Computing PCA for visualization...', 'loading');

    // Perform PCA
    const vectors = embeddings.map(e => e.embedding);
    const { projected, pcaMean, pcaComponents } = performPCA(vectors, 2);

    // Store reduced embeddings with metadata
    const reducedEmbeddings = projected.map((coords, idx) => ({
        coords,
        color: getColorForDocument(embeddings[idx].sourceFile),
        entry: embeddings[idx]
    }));

    setupGraphLegend(graphLegend);

    // Show graph and toggle button by default
    graphToggleContainer.style.display = '';
    graphSection.classList.add('visible');
    toggleGraphButton.textContent = 'Hide Graph';

    drawEmbeddingsGraph(canvas, reducedEmbeddings, null);

    updateStatus('✨ Ready! Enter your query and press Search', 'success');

    return { reducedEmbeddings, pcaMean, pcaComponents };
}
