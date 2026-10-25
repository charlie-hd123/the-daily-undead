export function puzzleOptions(env = {}) {
  const production = env.DEPLOYMENT_ENVIRONMENT === 'production';
  return {
    bloodTies: production || env.BLOOD_TIES_DEMO === '1' && ['local', 'staging'].includes(env.DEPLOYMENT_ENVIRONMENT),
    production,
  };
}
