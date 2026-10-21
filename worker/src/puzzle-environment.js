export function puzzleOptions(env = {}) {
  return { bloodTies: env.BLOOD_TIES_DEMO === '1' && ['local', 'staging'].includes(env.DEPLOYMENT_ENVIRONMENT) };
}
