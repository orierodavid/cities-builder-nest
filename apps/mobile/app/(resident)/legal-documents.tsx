import React from "react";
import { Screen } from "../../src/components/ui";
import ResidentLegalDocuments from "../../components/ResidentLegalDocuments";

export default function ResidentLegalDocumentsScreen() {
  return (
    <Screen title="Terms & Privacy" subtitle="Review the current legal documents">
      <ResidentLegalDocuments />
    </Screen>
  );
}
