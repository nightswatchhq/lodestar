'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { SourceUnavailable } from '@/components/ui/SourceUnavailable';

/**
 * A section kittiwake left out, in the frame it would have filled. The frame stays because an empty
 * table here would read as a claim about the indexer rather than about a failed read.
 */
export function MissingSection({
  title,
  what,
  detail,
}: {
  title: string;
  what: string;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <SourceUnavailable what={what} detail={detail} />
      </CardContent>
    </Card>
  );
}
