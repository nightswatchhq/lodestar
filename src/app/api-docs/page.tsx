import type { Metadata } from 'next';

import ApiReference from './ApiReference';

export const metadata: Metadata = {
  title: 'API | Lodestar',
  description:
    'The API behind Lodestar: every public route, read live from its OpenAPI document, with its rate limits.',
};

export default function ApiDocsPage() {
  return <ApiReference />;
}
