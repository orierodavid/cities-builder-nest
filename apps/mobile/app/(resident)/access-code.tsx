import React from 'react';
import { Redirect } from 'expo-router';

// Keep the legacy deep link valid while the resident visitor workflow is
// consolidated into the Visitor Management screen.
export default function AccessCodeRoute() {
  return <Redirect href={'/(resident)/visitors' as never} />;
}
