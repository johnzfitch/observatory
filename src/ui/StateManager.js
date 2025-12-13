/**
 * StateManager - Centralized state management for deepfake detector
 *
 * Handles:
 * - Image state and blob management (with cleanup)
 * - Selected models tracking
 * - Analysis state
 * - Results caching and job cache clearing
 * - Model loading status
 */

export class StateManager {
  constructor() {
    this.reset();
  }

  /**
   * Reset all state to defaults
   */
  reset() {
    this.state = {
      currentImage: null,
      currentImageBlob: null,
      selectedModels: new Set(['dima806_ai_real', 'smogy', 'umm_maybe', 'prithiv_v2']),
      isAnalyzing: false,
      analysisResults: null,
      loadedModels: new Set(),
      jobCache: null
    };

    console.log('[StateManager] State reset');
  }

  /**
   * Set image with blob URL
   * Cleans up previous image URL if it was a blob
   */
  setImage(imageUrl, blob = null) {
    // Clean up previous image URL if exists
    if (this.state.currentImage && this.state.currentImage.startsWith('blob:')) {
      URL.revokeObjectURL(this.state.currentImage);
    }

    this.state.currentImage = imageUrl;
    this.state.currentImageBlob = blob;
    this.state.analysisResults = null;
    this.clearJobCache();

    console.log('[StateManager] Image set, previous results cleared');
  }

  /**
   * Clear current image and clean up blob URL
   */
  clearImage() {
    if (this.state.currentImage && this.state.currentImage.startsWith('blob:')) {
      URL.revokeObjectURL(this.state.currentImage);
    }

    this.state.currentImage = null;
    this.state.currentImageBlob = null;
    this.state.analysisResults = null;
    this.clearJobCache();

    console.log('[StateManager] Image cleared');
  }

  /**
   * Set analysis in-progress state
   */
  setAnalyzing(isAnalyzing) {
    this.state.isAnalyzing = isAnalyzing;
    if (!isAnalyzing) {
      this.clearJobCache();
    }
  }

  /**
   * Clear job cache (used between analyses)
   */
  clearJobCache() {
    this.state.jobCache = null;
    console.log('[StateManager] Job cache cleared');
  }

  /**
   * Store analysis results
   */
  setAnalysisResults(results) {
    this.state.analysisResults = results;
    this.clearJobCache();
  }

  /**
   * Toggle model selection
   */
  toggleModel(modelId) {
    if (this.state.selectedModels.has(modelId)) {
      this.state.selectedModels.delete(modelId);
    } else {
      this.state.selectedModels.add(modelId);
    }
  }

  /**
   * Get array of selected model IDs
   */
  getSelectedModels() {
    return Array.from(this.state.selectedModels);
  }

  /**
   * Check if analysis can proceed
   */
  canAnalyze() {
    return this.state.currentImage &&
           this.state.selectedModels.size > 0 &&
           !this.state.isAnalyzing;
  }

  /**
   * Get current state (for debugging)
   */
  getState() {
    return {
      ...this.state,
      selectedModels: Array.from(this.state.selectedModels),
      loadedModels: Array.from(this.state.loadedModels)
    };
  }
}

// Export singleton instance
export const stateManager = new StateManager();
