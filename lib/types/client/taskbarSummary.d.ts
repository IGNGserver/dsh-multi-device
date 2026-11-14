/**
 * Window/taskbar aggregate of every device's Session status.
 *
 * Counts are the tab capsule's own three categories and nothing else — needs
 * reply, running, finished-unread — because the title and the strip must never
 * disagree:
 *
 * - The Host's `attentionByDevice` projection already excludes archived rows,
 *   subagent children and blank Sessions, and makes the three categories
 *   mutually exclusive (pending > running > unread). Summing its arrays is
 *   therefore the same number the device pill shows, added up across devices.
 * - "Finished" means finished-and-unread, exactly like the green pill: reading
 *   a conversation clears it. A poll of "everything that ever finished" would
 *   grow without bound and has no bounded source in DSH.
 * - No "failed" category. DSH exposes no per-Session failure to a plugin
 *   (`sessionListMetadata` carries `blank`/`lastPromptAt`, `uiSession.status`
 *   carries running/pendingInteraction/completionUnread), so a failure count
 *   would have to be invented. The strip has no such segment either.
 *
 * Every function here is pure: the title controller owns the DOM, the Host
 * owns the counts.
 *
 * @module dsh-multi-device/client/taskbarSummary
 */
import type { DeviceAttentionView } from '../attention.ts';
import { type DeviceView } from '../contract.ts';
import type { MultiDeviceLocaleKey } from './locales.ts';
/** The three categories the device capsule shows, in title order. */
export declare const TASKBAR_SEGMENT_ORDER: readonly ["running", "pending", "unread"];
export type TaskbarSegmentCategory = (typeof TASKBAR_SEGMENT_ORDER)[number];
/** One counted category; absent categories are omitted rather than shown as 0. */
export interface TaskbarSegment {
    readonly category: TaskbarSegmentCategory;
    readonly count: number;
}
/** Per-category totals across every device. */
export interface TaskbarTally {
    readonly running: number;
    readonly pending: number;
    readonly unread: number;
}
export declare const EMPTY_TALLY: TaskbarTally;
/**
 * Fields the tally reads. Narrower than {@link MultiDeviceSnapshot} on purpose:
 * a snapshot structurally satisfies it, and a test can pass only what it means
 * to exercise.
 */
export interface TaskbarTallyInput {
    readonly devices: readonly DeviceView[];
    readonly attentionByDevice?: Readonly<Record<string, DeviceAttentionView>> | undefined;
    readonly unreadSessionIds: readonly string[];
    readonly archivedSessionIds?: readonly string[] | undefined;
    readonly subagentSessionIds?: readonly string[] | undefined;
}
/**
 * Count every device's Sessions by category.
 *
 * Session IDs are collected into sets before counting so the result cannot
 * double-count a row that a Host bug binds to two device views; remote IDs are
 * namespaced (`md~<device>~<id>`), so distinct rows never collide.
 *
 * A Host older than this plugin publishes no `attentionByDevice`. The tally
 * then falls back to the per-device counters on `DeviceView` plus DSH's raw
 * unread set instead of reporting an authoritative-looking zero.
 */
export declare function tallyTaskbarSessions(input: TaskbarTallyInput): TaskbarTally;
/** True when nothing is running, waiting or unread. */
export declare function tallyIsEmpty(tally: TaskbarTally): boolean;
/** Non-zero categories in title order; a quiet strip produces an empty list. */
export declare function taskbarSegments(tally: TaskbarTally): TaskbarSegment[];
export type TaskbarTranslate = (key: MultiDeviceLocaleKey) => string;
/**
 * Render `1跑 2结`, or `undefined` when there is nothing to report.
 *
 * `undefined` is load-bearing: the caller must then leave the title to DSH (or
 * to the active device's own page title) rather than paint an empty aggregate.
 */
export declare function formatTaskbarSummary(tally: TaskbarTally, t: TaskbarTranslate): string | undefined;
