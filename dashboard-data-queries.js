/**
 * LARYA Operational Dashboard - HubSpot Data Queries
 * Pulls funnel data: Lead Entrou → Meeting → Aprovado → Vistoria → Emissão
 * Tracks: stage progression dates, partner/pipeline origin, revenue/commission
 */

const https = require('https');
const { DateTime } = require('luxon');

class LARYADashboardData {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.hubapi.com';
    this.timezone = 'America/Sao_Paulo';
    
    // HubSpot property mappings
    this.properties = {
      core: [
        'dealname',
        'pipeline',
        'dealstage',
        'hubspot_owner_id',
        'createdate',
        'closedate',
        'hs_analytics_source',
        'amount'
      ],
      financial: [
        'valor_do_financiamento', // valor do financiamento
        'valor_do_emprestimo'      // valor do emprestimo
      ],
      partner: [
        'indicacao_parceiro',      // Indicação Parceiro
        'nome_de_parceiro',        // nome de parceiro
        'nome_de_corretor'         // Nome_de_corretor
      ],
      dates: [
        'stage_lead_entrou_date',
        'stage_reuniao_date',
        'stage_simulacao_enviada_date',
        'stage_aprovado_date',
        'stage_vistoria_date',
        'stage_emissao_date'
      ]
    };

    this.stages = {
      'Lead Entrou': 'lead_entrou',
      'Reunião': 'reuniao',
      'Simulação Enviada': 'simulacao_enviada',
      'Aprovado': 'aprovado',
      'Vistoria': 'vistoria',
      'Emissão': 'emissao'
    };

    this.stageOrder = [
      'Lead Entrou',
      'Reunião',
      'Simulação Enviada',
      'Aprovado',
      'Vistoria',
      'Emissão'
    ];
  }

  /**
   * Make HTTPS request to HubSpot API
   */
  async hubspotRequest(endpoint, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}${endpoint}`);
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  /**
   * Query all deals with complete property set
   */
  async getAllDeals(startDate, endDate) {
    try {
      const allProps = [
        ...this.properties.core,
        ...this.properties.financial,
        ...this.properties.partner,
        ...this.properties.dates
      ];

      const filter = {
        filters: [
          {
            propertyName: 'createdate',
            operator: 'GTE',
            value: new Date(startDate).getTime()
          },
          {
            propertyName: 'createdate',
            operator: 'LTE',
            value: new Date(endDate).getTime()
          }
        ]
      };

      const response = await this.hubspotRequest(
        `/crm/v3/objects/deals?limit=100&properties=${allProps.join(',')}`,
        'POST',
        filter
      );

      return (response.results || []).map(deal => ({
        id: deal.id,
        properties: deal.properties
      }));
    } catch (error) {
      console.error('Error fetching deals:', error);
      return [];
    }
  }

  /**
   * Get deal by stage on reporting date
   */
  async getDealsByStage(stage, date) {
    try {
      const filter = {
        filters: [
          {
            propertyName: 'dealstage',
            operator: '==',
            value: stage
          }
        ]
      };

      const response = await this.hubspotRequest(
        `/crm/v3/objects/deals?limit=100&properties=${this.properties.core.join(',')}`,
        'POST',
        filter
      );

      return (response.results || []).map(deal => ({
        id: deal.id,
        properties: deal.properties
      }));
    } catch (error) {
      console.error(`Error fetching deals in stage ${stage}:`, error);
      return [];
    }
  }

  /**
   * Get sales reps/owners
   */
  async getSalesReps() {
    try {
      const response = await this.hubspotRequest(
        '/crm/v3/objects/contacts?limit=100&properties=firstname,lastname,hubspot_owner_id'
      );

      const reps = new Map();
      (response.results || []).forEach(contact => {
        const ownerId = contact.properties.hubspot_owner_id;
        if (ownerId && !reps.has(ownerId)) {
          const firstName = contact.properties.firstname || '';
          const lastName = contact.properties.lastname || '';
          reps.set(ownerId, {
            id: ownerId,
            name: `${firstName} ${lastName}`.trim()
          });
        }
      });

      return reps;
    } catch (error) {
      console.error('Error fetching sales reps:', error);
      return new Map();
    }
  }

  /**
   * Calculate commission from deal
   * valor do financiamento OR valor do emprestimo * 0.01 (1%)
   */
  getCommissionForecast(deal) {
    const valor = 
      parseFloat(deal.properties.valor_do_financiamento || 0) ||
      parseFloat(deal.properties.valor_do_emprestimo || 0);
    
    return valor > 0 ? valor * 0.01 : 0;
  }

  /**
   * Get partner name from deal
   */
  getPartnerName(deal) {
    // Priority: nome de parceiro > Indicação Parceiro > pipeline
    const partnerName = deal.properties.nome_de_parceiro || deal.properties.indicacao_parceiro;
    
    if (partnerName && partnerName.trim()) {
      return partnerName.trim();
    }

    // Fallback to pipeline
    const pipeline = deal.properties.pipeline;
    if (pipeline === 'Parceiros - Indicações') {
      return 'Parceiros - Indicações';
    }

    return deal.properties.hs_analytics_source || 'Direct';
  }

  /**
   * Build funnel for a period (week or month)
   * Returns: stage → stage conversion %
   */
  async buildFunnel(startDate, endDate) {
    const deals = await this.getAllDeals(startDate, endDate);
    const reps = await this.getSalesReps();

    // Initialize funnel structure
    const funnel = {
      period: { startDate, endDate },
      summary: {},
      byRep: {},
      byPartner: {},
      byPipeline: {},
      conversions: {},
      forecast: null
    };

    // Initialize stages
    this.stageOrder.forEach(stage => {
      funnel.summary[stage] = {
        count: 0,
        value: 0,
        commission: 0,
        deals: []
      };
    });

    // Process each deal
    deals.forEach(deal => {
      const stage = deal.properties.dealstage;
      const rep = reps.get(deal.properties.hubspot_owner_id) || { name: 'No owner' };
      const partner = this.getPartnerName(deal);
      const pipeline = deal.properties.pipeline;
      const commission = this.getCommissionForecast(deal);

      // Add to stage summary
      if (funnel.summary[stage]) {
        funnel.summary[stage].count++;
        funnel.summary[stage].value += commission;
        funnel.summary[stage].commission += commission;
        funnel.summary[stage].deals.push({
          id: deal.id,
          name: deal.properties.dealname,
          owner: rep.name,
          commission
        });
      }

      // Track by rep
      if (!funnel.byRep[rep.name]) {
        funnel.byRep[rep.name] = {};
        this.stageOrder.forEach(s => {
          funnel.byRep[rep.name][s] = { count: 0, value: 0 };
        });
      }
      if (funnel.byRep[rep.name][stage]) {
        funnel.byRep[rep.name][stage].count++;
        funnel.byRep[rep.name][stage].value += commission;
      }

      // Track by partner
      if (!funnel.byPartner[partner]) {
        funnel.byPartner[partner] = {};
        this.stageOrder.forEach(s => {
          funnel.byPartner[partner][s] = { count: 0, value: 0 };
        });
      }
      if (funnel.byPartner[partner][stage]) {
        funnel.byPartner[partner][stage].count++;
        funnel.byPartner[partner][stage].value += commission;
      }

      // Track by pipeline
      if (!funnel.byPipeline[pipeline]) {
        funnel.byPipeline[pipeline] = {};
        this.stageOrder.forEach(s => {
          funnel.byPipeline[pipeline][s] = { count: 0, value: 0 };
        });
      }
      if (funnel.byPipeline[pipeline][stage]) {
        funnel.byPipeline[pipeline][stage].count++;
        funnel.byPipeline[pipeline][stage].value += commission;
      }
    });

    // Calculate conversion percentages
    funnel.conversions = this.calculateConversions(funnel.summary);

    return funnel;
  }

  /**
   * Calculate stage-to-stage conversion percentages
   */
  calculateConversions(summary) {
    const conversions = {};

    for (let i = 0; i < this.stageOrder.length - 1; i++) {
      const currentStage = this.stageOrder[i];
      const nextStage = this.stageOrder[i + 1];
      const currentCount = summary[currentStage].count;
      const nextCount = summary[nextStage].count;

      conversions[`${currentStage} → ${nextStage}`] = 
        currentCount > 0 ? ((nextCount / currentCount) * 100).toFixed(1) : 0;
    }

    return conversions;
  }

  /**
   * Revenue forecast: aprovados → projected emissão
   * Based on historical conversion rate
   */
  async calculateForecast(historicalConversionRate = 0.85) {
    try {
      // Get current aprovados
      const aprovados = await this.getDealsByStage('Aprovado', new Date());

      const totalAprovadoValue = aprovados.reduce((sum, deal) => {
        return sum + this.getCommissionForecast(deal);
      }, 0);

      // Forecast based on conversion rate
      const projectedEmissaoValue = totalAprovadoValue * historicalConversionRate;

      return {
        currentAprovados: aprovados.length,
        currentAprovadoValue: totalAprovadoValue,
        projectedEmissaoCount: Math.round(aprovados.length * historicalConversionRate),
        projectedEmissaoValue: projectedEmissaoValue,
        conversionAssumption: `${(historicalConversionRate * 100).toFixed(0)}%`
      };
    } catch (error) {
      console.error('Error calculating forecast:', error);
      return null;
    }
  }

  /**
   * Format funnel data for display
   */
  formatFunnelForDisplay(funnel) {
    const formatted = {
      period: funnel.period,
      funnel: [],
      byRep: [],
      byPartner: [],
      byPipeline: [],
      conversions: funnel.conversions
    };

    // Format main funnel
    this.stageOrder.forEach(stage => {
      const data = funnel.summary[stage];
      formatted.funnel.push({
        stage,
        count: data.count,
        value: data.value.toFixed(0),
        commission: data.commission.toFixed(0)
      });
    });

    // Format by rep
    Object.entries(funnel.byRep).forEach(([rep, stages]) => {
      const repData = {
        rep,
        stages: {}
      };
      this.stageOrder.forEach(stage => {
        if (stages[stage]) {
          repData.stages[stage] = {
            count: stages[stage].count,
            value: stages[stage].value.toFixed(0)
          };
        }
      });
      formatted.byRep.push(repData);
    });

    // Format by partner
    Object.entries(funnel.byPartner).forEach(([partner, stages]) => {
      const partnerData = {
        partner,
        stages: {}
      };
      this.stageOrder.forEach(stage => {
        if (stages[stage]) {
          partnerData.stages[stage] = {
            count: stages[stage].count,
            value: stages[stage].value.toFixed(0)
          };
        }
      });
      formatted.byPartner.push(partnerData);
    });

    // Format by pipeline
    Object.entries(funnel.byPipeline).forEach(([pipeline, stages]) => {
      const pipelineData = {
        pipeline,
        stages: {}
      };
      this.stageOrder.forEach(stage => {
        if (stages[stage]) {
          pipelineData.stages[stage] = {
            count: stages[stage].count,
            value: stages[stage].value.toFixed(0)
          };
        }
      });
      formatted.byPipeline.push(pipelineData);
    });

    return formatted;
  }
}

module.exports = LARYADashboardData;
