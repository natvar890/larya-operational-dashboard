/**
 * Vercel Serverless Function - Weekly Operational Report
 * Endpoint: /api/weekly
 * Schedule: Friday 9 AM America/Sao_Paulo
 */

const { DateTime } = require('luxon');
const WeeklyReportGenerator = require('../weekly-report-generator');

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

    const generator = new WeeklyReportGenerator(apiKey, webhookUrl);
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
