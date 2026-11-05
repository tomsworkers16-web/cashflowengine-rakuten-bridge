// Reporting cannot imply that a disabled action is active or should be enabled.
export function operationalAdvice({autoPosting,externalReply,status}) {
  const autoActive = autoPosting === true;
  const replyActive = externalReply === true;
  const caution = status === 'CAUTION';
  return {
    currentAutoPostingEnabled: autoActive,
    currentExternalReplyEnabled: replyActive,
    keepAutoPostEnabled: autoActive && !caution,
    keepExternalReplyEnabled: replyActive && !caution,
    increaseReplyVolume: false,
    requiresOperatorReview: caution && (autoActive || replyActive),
    reason: caution
      ? 'Runtime warning detected. Review before continuing active publishing; no .env switches were changed.'
      : autoActive || replyActive
        ? 'Preserve the current activation settings while gathering verified click and conversion evidence.'
        : 'Both publishing controls are currently disabled. Report does not authorize activation.'
  };
}
