const REQUIRED_FIELDS = ['membershipName', 'phone'];

function getMissingFields(body) {
  return REQUIRED_FIELDS.filter((field) => {
    const value = body?.[field];
    return value === undefined || value === null || value === '';
  });
}

export async function signOutHandler(req, res, next) {
  try {
    const missingFields = getMissingFields(req.body);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        missingFields,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Sign-out recorded successfully',
      data: {
        membershipName: req.body.membershipName,
        phone: req.body.phone,
        type: 'sign_out',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return next(error);
  }
}
