import React from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Cloud,
  HardDrive,
  GitMerge,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import { SyncHealthReport } from '../lib/syncMerge';
import { User } from '../lib/firebase';

interface SyncHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  isSyncing: boolean;
  syncHealth: SyncHealthReport;
  lastSyncedAt: string | null;
  onReconcileUnion: () => void;
  onReconcilePullCloud: () => void;
  onReconcilePushLocal: () => void;
  onVerifyLiveServer: () => void;
  onSignIn: () => void;
}

export const SyncHealthModal: React.FC<SyncHealthModalProps> = ({
  isOpen,
  onClose,
  user,
  isSyncing,
  syncHealth,
  lastSyncedAt,
  onReconcileUnion,
  onReconcilePullCloud,
  onReconcilePushLocal,
  onVerifyLiveServer,
  onSignIn,
}) => {
  if (!isOpen) return null;

  const isDrift = syncHealth.status === 'drift_detected';
  const isHealthy = syncHealth.status === 'healthy';
  const orphanCount =
    syncHealth.deltas.orphanedTransactions.length + syncHealth.deltas.orphanedAssets.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#0B101B] border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-[#080C14]">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                !user
                  ? 'bg-slate-800/60 border-slate-700 text-slate-400'
                  : isDrift
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              }`}
            >
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">
                  Sync Health &amp; Ledger Consistency
                </h2>
                {user && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                      isSyncing
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        : isDrift
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSyncing
                          ? 'bg-amber-400 animate-pulse'
                          : isDrift
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                      }`}
                    />
                    {isSyncing
                      ? 'Syncing...'
                      : isDrift
                      ? `Drift (${syncHealth.totalDriftCount})`
                      : 'In Sync'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Atomic Firestore Transaction Guard &amp; Local vs. Cloud Snapshot Verification
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {!user ? (
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Local-Only Ledger Mode
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Sign in with Google to enable real-time atomic cloud sync, cross-device snapshot
                  verification, and drift reconciliation.
                </p>
              </div>
              <div className="pt-1">
                <button
                  onClick={() => {
                    onClose();
                    onSignIn();
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-all cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Connect Google Cloud Sync</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Status Summary Banner */}
              <div
                className={`rounded-xl p-4 border flex items-start justify-between gap-4 ${
                  isDrift
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  {isDrift ? (
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider">
                      {isDrift
                        ? `State Drift Detected (${syncHealth.totalDriftCount} ${
                            syncHealth.totalDriftCount === 1 ? 'Difference' : 'Differences'
                          })`
                        : 'Ledger & Cloud Snapshot Perfectly Matched'}
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {isDrift
                        ? 'Your local device state and the latest Cloud Snapshot have diverged. Use one of the explicit Reconcile actions below to restore atomic consistency.'
                        : 'All transactions, assets, and categories on this device match the latest Cloud Snapshot with 100% referential integrity.'}
                    </p>
                    {lastSyncedAt && (
                      <p className="text-[11px] text-slate-400 mt-1.5 font-mono">
                        Last verified snapshot: {lastSyncedAt}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={onVerifyLiveServer}
                  disabled={isSyncing}
                  className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  title="Fetch live snapshot directly from Firestore server"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>Verify Server</span>
                </button>
              </div>

              {/* Side-by-Side State Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Local Ledger Card */}
                <div className="rounded-xl bg-[#0D131F] border border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                      <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                      <span>Local Device Ledger</span>
                    </div>
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-300">
                      #{syncHealth.localChecksum}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="bg-slate-900/70 rounded-lg p-2.5 border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 uppercase">Transactions</div>
                      <div className="text-sm font-bold font-mono text-slate-100 mt-0.5">
                        {syncHealth.counts.localTransactions}
                      </div>
                    </div>
                    <div className="bg-slate-900/70 rounded-lg p-2.5 border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 uppercase">Assets</div>
                      <div className="text-sm font-bold font-mono text-slate-100 mt-0.5">
                        {syncHealth.counts.localAssets}
                      </div>
                    </div>
                    <div className="bg-slate-900/70 rounded-lg p-2.5 border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 uppercase">Categories</div>
                      <div className="text-sm font-bold font-mono text-slate-100 mt-0.5">
                        {syncHealth.counts.localCategories}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/70">
                    <span className="text-slate-400">Referential Integrity:</span>
                    {orphanCount === 0 ? (
                      <span className="text-emerald-400 font-medium inline-flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Valid (0 Orphans)
                      </span>
                    ) : (
                      <span className="text-amber-400 font-medium">
                        {orphanCount} Unlinked Ref(s)
                      </span>
                    )}
                  </div>
                </div>

                {/* Cloud Snapshot Card */}
                <div className="rounded-xl bg-[#0D131F] border border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                      <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Latest Cloud Snapshot</span>
                    </div>
                    <span
                      className={`font-mono text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 ${
                        syncHealth.cloudChecksum === syncHealth.localChecksum
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }`}
                    >
                      {syncHealth.cloudChecksum ? `#${syncHealth.cloudChecksum}` : 'Pending'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="bg-slate-900/70 rounded-lg p-2.5 border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 uppercase">Transactions</div>
                      <div className="text-sm font-bold font-mono text-slate-100 mt-0.5">
                        {syncHealth.counts.cloudTransactions}
                      </div>
                    </div>
                    <div className="bg-slate-900/70 rounded-lg p-2.5 border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 uppercase">Assets</div>
                      <div className="text-sm font-bold font-mono text-slate-100 mt-0.5">
                        {syncHealth.counts.cloudAssets}
                      </div>
                    </div>
                    <div className="bg-slate-900/70 rounded-lg p-2.5 border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 uppercase">Categories</div>
                      <div className="text-sm font-bold font-mono text-slate-100 mt-0.5">
                        {syncHealth.counts.cloudCategories}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/70">
                    <span className="text-slate-400">Commit Protocol:</span>
                    <span className="text-emerald-400 font-medium">
                      Firestore Atomic Transaction
                    </span>
                  </div>
                </div>
              </div>

              {/* Drift Item Breakdown (if any drift exists) */}
              {syncHealth.driftItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Detected Ledger &amp; Asset Differences ({syncHealth.driftItems.length})
                    </h4>
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-[#080C14] divide-y divide-slate-800/70">
                    {syncHealth.driftItems.map((item) => (
                      <div
                        key={item.id}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-200 truncate">{item.label}</div>
                          <div className="text-[11px] text-slate-400 truncate">{item.detail}</div>
                        </div>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            item.driftType === 'local_only'
                              ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                              : item.driftType === 'cloud_only'
                              ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                              : item.driftType === 'orphaned'
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {item.driftType === 'local_only'
                            ? 'Local Only'
                            : item.driftType === 'cloud_only'
                            ? 'Cloud Only'
                            : item.driftType === 'orphaned'
                            ? 'Orphan Ref'
                            : 'Modified'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Explicit Reconcile Actions */}
              <div className="space-y-2.5 pt-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Reconciliation Actions
                </h4>

                <div className="grid grid-cols-1 gap-2.5">
                  {/* Primary Recommended: Atomic Smart Reconcile */}
                  <button
                    onClick={onReconcileUnion}
                    disabled={isSyncing}
                    className="w-full flex items-center justify-between gap-3 p-3.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-left transition-all cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                        <GitMerge className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-emerald-200 flex items-center gap-2">
                          <span>Reconcile Now (Atomic Union Merge)</span>
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-[10px] text-emerald-300 font-semibold">
                            Recommended
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          Atomically merges Local and Cloud records using latest timestamps,
                          preserves active asset references, and updates both Local &amp; Cloud.
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Secondary Options: Pull Cloud or Force Push Local */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      onClick={onReconcilePullCloud}
                      disabled={isSyncing}
                      className="flex items-start gap-2.5 p-3 rounded-xl bg-[#0D131F] hover:bg-slate-800/70 border border-slate-800 hover:border-slate-700 text-left transition-all cursor-pointer disabled:opacity-50"
                    >
                      <div className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-300 flex items-center justify-center shrink-0 mt-0.5">
                        <ArrowDownToLine className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          Adopt Cloud Snapshot
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Overwrite local ledger with the authoritative Cloud Snapshot.
                        </p>
                      </div>
                    </button>

                    <button
                      onClick={onReconcilePushLocal}
                      disabled={isSyncing}
                      className="flex items-start gap-2.5 p-3 rounded-xl bg-[#0D131F] hover:bg-slate-800/70 border border-slate-800 hover:border-slate-700 text-left transition-all cursor-pointer disabled:opacity-50"
                    >
                      <div className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0 mt-0.5">
                        <ArrowUpFromLine className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          Force Push Local Ledger
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Atomically overwrite Cloud Snapshot with this device&apos;s current state.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800/80 bg-[#080C14] flex items-center justify-between text-xs">
          <span className="text-slate-500 font-mono text-[11px]">
            {isHealthy && user
              ? `Checksum Verified: #${syncHealth.localChecksum}`
              : `Local #${syncHealth.localChecksum}${
                  syncHealth.cloudChecksum ? ` · Cloud #${syncHealth.cloudChecksum}` : ''
                }`}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
