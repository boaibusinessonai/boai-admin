import { Badge } from './ui'

// Admin › Test data's header (sketch board Main): the heading with where it fills, and the one line under it.
export const TEST_DATA_LINE = 'A test login with a full store, every part of its trade filled. Never in PROD.'

export function TestDataHead({ many }: { many: boolean }) {
  return (
    <header className="page-head">
      <div>
        <h1>Test data <Badge tone="warning">{many ? 'Build, DEV, SIT, UAT' : 'Build only'}</Badge></h1>
        <p className="sub">{TEST_DATA_LINE}</p>
      </div>
    </header>
  )
}
