// ============================================================================
//  Auth profile race guard (F13). `onAuthStateChange` / `getSession` can fire
//  overlapping, un-awaited `loadProfile` calls — without a guard, whichever
//  call happens to RESOLVE last wins, regardless of which one actually
//  started last. That can let a stale role/rig apply after sign-out or after
//  switching accounts. This tiny stateful-but-pure class is the extracted
//  decision: "is this in-flight result still the one that should win?"
// ============================================================================

export class AuthRaceGuard {
  private token = 0;

  /** Call when a new profile load begins; keep the returned token to check
   *  against later, once the load resolves. */
  start(): number {
    return ++this.token;
  }

  /** Call on any event that should discard in-flight results outright
   *  (e.g. sign-out), even if nothing new is starting right now. */
  invalidate(): void {
    this.token++;
  }

  /** True if `myToken` is still the most recent one issued — i.e. no later
   *  `start()`/`invalidate()` happened while this load was in flight. */
  isCurrent(myToken: number): boolean {
    return myToken === this.token;
  }
}
