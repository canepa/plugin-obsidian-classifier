import mediumEnglish from './dictionaries/medium-english.json';
import digitalMarketingEnglish from './dictionaries/digital-marketing-english.json';
import digitalMarketingItalian from './dictionaries/digital-marketing-italian.json';
import householdEnglish from './dictionaries/household-english.json';
import householdItalian from './dictionaries/household-italian.json';

export interface BundledDictionary {
  id: string;
  name: string;
  filename: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: Record<string, any>;
}

export const BUNDLED_DICTIONARIES: BundledDictionary[] = [
  {
    id: 'medium-english',
    name: 'Medium (English)',
    filename: 'medium-english.json',
    content: mediumEnglish,
  },
  {
    id: 'digital-marketing-english',
    name: 'Digital Marketing (English)',
    filename: 'digital-marketing-english.json',
    content: digitalMarketingEnglish,
  },
  {
    id: 'digital-marketing-italian',
    name: 'Digital Marketing (Italian)',
    filename: 'digital-marketing-italian.json',
    content: digitalMarketingItalian,
  },
  {
    id: 'household-english',
    name: 'Household (English)',
    filename: 'household-english.json',
    content: householdEnglish,
  },
  {
    id: 'household-italian',
    name: 'Household (Italian)',
    filename: 'household-italian.json',
    content: householdItalian,
  },
];
