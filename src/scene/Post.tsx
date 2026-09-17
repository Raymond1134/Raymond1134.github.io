import { lazy } from 'react'
import { NO_COMPOSER } from './composerPolicy'

const loading = NO_COMPOSER ? null : import('./PostComposer')

const PostComposer = lazy(() => loading ?? import('./PostComposer'))

export default function Post() {
  return NO_COMPOSER ? null : <PostComposer />
}
