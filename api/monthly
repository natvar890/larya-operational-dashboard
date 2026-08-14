/**
 * Vercel Serverless Function - Monthly Operational Report
 * Endpoint: /api/monthly
 * Schedule: 1st of month 9 AM America/Sao_Paulo
 */

const { DateTime } = require('luxon');
const MonthlyReportGenerator = require('../monthly-report-generator');

module.exports = async (req, res) => {
  try {
    const apiKey = process.env.HUBSPOT_API_KEY;
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!apiKey || !webhookUrl) {
      return res.status(400).json({
        success: false,
        message: 'Missing environment variables'
      });
    }

    const generator = new MonthlyReportGenerator(apiKey, webhookUrl);
    const result = await generator.generate();

    res.status(200).json({
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
