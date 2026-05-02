/**
 * Skeletons
 *
 * Placeholder UI shown while real content loads. Each skeleton mirrors the
 * layout of the real component so when content arrives there's no jarring
 * shift — just gray boxes "filling in" with real content.
 *
 * Uses Tailwind's animate-pulse for the shimmer (built-in, no JS animation
 * cost). Colors stay subtle (gray-100 to gray-200) so the screen doesn't
 * scream "LOADING!!!" at the user.
 */

/** Single conversation row skeleton — matches InboxView's row dimensions exactly. */
function InboxRowSkeleton() {
  return (
    <div className="w-full flex items-center gap-3 px-5 py-3.5">
      <div className="w-14 h-14 rounded-full bg-gray-200 flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-gray-200 rounded w-24" />
          <div className="h-3 bg-gray-100 rounded w-8" />
        </div>
        <div className="h-3 bg-gray-100 rounded w-3/4" />
      </div>
    </div>
  );
}

/** Full inbox skeleton — header + 4 row placeholders. */
export function InboxSkeleton() {
  return (
    <div className="flex flex-col bg-parallel-cream animate-pulse" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="flex-shrink-0 bg-parallel-cream border-b border-gray-100 px-5 pt-5 pb-4">
        <div className="h-7 bg-gray-200 rounded w-32" />
      </div>

      <div className="flex-1 overflow-hidden">
        {/* 4 conversation row placeholders. 4 is enough to fill a phone screen. */}
        <div className="divide-y divide-gray-100">
          {[0, 1, 2, 3].map((i) => (
            <InboxRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Single message bubble skeleton, alternating sides. */
function MessageBubbleSkeleton({ side, width }: { side: 'left' | 'right'; width: string }) {
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'} px-4 py-1`}>
      <div
        className={`h-9 rounded-2xl ${side === 'right' ? 'bg-gray-200' : 'bg-gray-100'}`}
        style={{ width }}
      />
    </div>
  );
}

/**
 * Messaging skeleton — header bar (with photo + name placeholder), a few
 * message bubbles alternating sides, input area.
 *
 * Skip rendering the input — it's not interactive yet anyway, and including
 * it makes the skeleton feel less "honest" about loading state.
 */
export function MessagingSkeleton() {
  return (
    <div className="flex flex-col bg-parallel-cream" style={{ height: '100dvh' }}>
      {/* Header — match the real header dimensions exactly to avoid layout shift */}
      <div className="flex-shrink-0 bg-parallel-cream border-b border-gray-200 px-4 py-3 z-10">
        <div className="flex items-center gap-2.5 animate-pulse">
          <div className="w-7 h-7 rounded-full bg-gray-100" />
          <div className="w-10 h-10 rounded-full bg-gray-200" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="h-4 bg-gray-200 rounded w-28" />
            <div className="h-3 bg-gray-100 rounded w-20" />
          </div>
          <div className="w-7 h-7 rounded-full bg-gray-100" />
        </div>
      </div>

      {/* Messages — pulsing bubbles in believable conversation rhythm */}
      <div className="flex-1 overflow-hidden py-4 animate-pulse">
        <MessageBubbleSkeleton side="left" width="60%" />
        <MessageBubbleSkeleton side="left" width="45%" />
        <MessageBubbleSkeleton side="right" width="55%" />
        <MessageBubbleSkeleton side="left" width="70%" />
        <MessageBubbleSkeleton side="right" width="40%" />
        <MessageBubbleSkeleton side="right" width="50%" />
      </div>

      {/* Bottom input bar placeholder — keeps layout stable */}
      <div className="flex-shrink-0 border-t border-gray-200 px-4 py-3">
        <div className="h-11 bg-gray-100 rounded-full animate-pulse" />
      </div>
    </div>
  );
}
