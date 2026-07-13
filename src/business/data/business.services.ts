import { BusinessServiceData } from '../types/constants';

export function getBusinessServices(): BusinessServiceData[] {
  return businessServices;
}

const businessServices: BusinessServiceData[] = [
  {
    title: 'Braids & Extentions',
    description: 'Braiding services and hair extensions',
  },
  {
    title: 'Eyebrow Services',
    description: 'Eyebrow shaping, threading, and treatments',
  },
  {
    title: 'Facial Treatments',
    description: 'Skincare and facial services',
  },
  {
    title: 'Hair Coloring',
    description: 'Hair dyeing, highlights, and color treatments',
  },
  {
    title: 'Hair Styling',
    description: 'Cuts, styling, and hair treatments',
  },
];
