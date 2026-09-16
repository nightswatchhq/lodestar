'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { SourceUnavailable } from '@/components/ui/SourceUnavailable';

/**
 * A section kittiwake left out of the profile, in the frame it would have filled.
 *
 * Since kittiwake#153 the route answers 200 without a section its nest refused rather than failing
 * the whole page. An absent section is not an empty one: a table with no rows here reads as "this
 * indexer has no delegators", which is a claim about the network made out of somebody else's
 * outage. The frame stays so the page keeps its shape, and says which read failed and why.
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
