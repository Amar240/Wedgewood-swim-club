export async function healthHandler(req, res, next) {
  try {
    return res.status(200).json({
      status: 'ok',
      service: 'Swim-Club-WedgeWood-Venderly',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    return next(error);
  }
}
