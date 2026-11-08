export interface VirtualWindow {
    readonly offsets: readonly number[];
    readonly start: number;
    readonly end: number;
    readonly top: number;
    readonly bottom: number;
    readonly total: number;
}
/** Fixed-height rows with prefix offsets; end is exclusive and includes overscan. */
export declare function virtualWindow(heights: readonly number[], scrollTop: number, viewportHeight: number, overscan?: number): VirtualWindow;
