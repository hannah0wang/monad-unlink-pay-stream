/**
 * US state income tax rates (approximate; for payroll withholding estimation).
 * Federal bracket uses the 22% standard rate (single filer, $44k–$95k range).
 */
export const FEDERAL_WITHHOLDING_PCT = 22   // standard bracket

export interface StateTaxInfo {
  state: string
  name:  string
  rate:  number   // percentage (0–13)
}

export const STATE_TAX_RATES: StateTaxInfo[] = [
  { state: 'AL', name: 'Alabama',        rate: 5.0  },
  { state: 'AK', name: 'Alaska',         rate: 0    },
  { state: 'AZ', name: 'Arizona',        rate: 2.5  },
  { state: 'AR', name: 'Arkansas',       rate: 5.9  },
  { state: 'CA', name: 'California',     rate: 9.3  },
  { state: 'CO', name: 'Colorado',       rate: 4.4  },
  { state: 'CT', name: 'Connecticut',    rate: 6.99 },
  { state: 'DE', name: 'Delaware',       rate: 6.6  },
  { state: 'FL', name: 'Florida',        rate: 0    },
  { state: 'GA', name: 'Georgia',        rate: 5.75 },
  { state: 'HI', name: 'Hawaii',         rate: 7.9  },
  { state: 'ID', name: 'Idaho',          rate: 5.8  },
  { state: 'IL', name: 'Illinois',       rate: 4.95 },
  { state: 'IN', name: 'Indiana',        rate: 3.05 },
  { state: 'IA', name: 'Iowa',           rate: 5.7  },
  { state: 'KS', name: 'Kansas',         rate: 5.7  },
  { state: 'KY', name: 'Kentucky',       rate: 4.5  },
  { state: 'LA', name: 'Louisiana',      rate: 4.25 },
  { state: 'ME', name: 'Maine',          rate: 7.15 },
  { state: 'MD', name: 'Maryland',       rate: 5.75 },
  { state: 'MA', name: 'Massachusetts',  rate: 5.0  },
  { state: 'MI', name: 'Michigan',       rate: 4.25 },
  { state: 'MN', name: 'Minnesota',      rate: 9.85 },
  { state: 'MS', name: 'Mississippi',    rate: 5.0  },
  { state: 'MO', name: 'Missouri',       rate: 5.3  },
  { state: 'MT', name: 'Montana',        rate: 6.75 },
  { state: 'NE', name: 'Nebraska',       rate: 6.84 },
  { state: 'NV', name: 'Nevada',         rate: 0    },
  { state: 'NH', name: 'New Hampshire',  rate: 0    },
  { state: 'NJ', name: 'New Jersey',     rate: 10.75},
  { state: 'NM', name: 'New Mexico',     rate: 5.9  },
  { state: 'NY', name: 'New York',       rate: 10.9 },
  { state: 'NC', name: 'North Carolina', rate: 4.75 },
  { state: 'ND', name: 'North Dakota',   rate: 2.5  },
  { state: 'OH', name: 'Ohio',           rate: 3.99 },
  { state: 'OK', name: 'Oklahoma',       rate: 4.75 },
  { state: 'OR', name: 'Oregon',         rate: 9.9  },
  { state: 'PA', name: 'Pennsylvania',   rate: 3.07 },
  { state: 'RI', name: 'Rhode Island',   rate: 5.99 },
  { state: 'SC', name: 'South Carolina', rate: 7.0  },
  { state: 'SD', name: 'South Dakota',   rate: 0    },
  { state: 'TN', name: 'Tennessee',      rate: 0    },
  { state: 'TX', name: 'Texas',          rate: 0    },
  { state: 'UT', name: 'Utah',           rate: 4.85 },
  { state: 'VT', name: 'Vermont',        rate: 8.75 },
  { state: 'VA', name: 'Virginia',       rate: 5.75 },
  { state: 'WA', name: 'Washington',     rate: 0    },
  { state: 'WV', name: 'West Virginia',  rate: 6.5  },
  { state: 'WI', name: 'Wisconsin',      rate: 7.65 },
  { state: 'WY', name: 'Wyoming',        rate: 0    },
]

/** Returns total withholding bps (federal + state) for a given state code */
export function taxBpsForState(stateCode: string): number {
  const state = STATE_TAX_RATES.find(s => s.state === stateCode)
  const statePct = state?.rate ?? 0
  return Math.round((FEDERAL_WITHHOLDING_PCT + statePct) * 100)
}
