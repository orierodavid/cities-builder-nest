import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "../lib/supabase";

type Document = {
  id: string;
  title: string;
  version: string;
  documentType: "terms" | "privacy" | string;
  content: string;
  effectiveAt?: string | null;
};
type Status = {
  documents: Document[];
  acceptedDocumentIds?: string[];
  configurationRequired?: boolean;
};

export default function ResidentLegalDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [acceptedIds, setAcceptedIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase.rpc("get_legal_consent_status");
    if (loadError || !data) {
      setError("Legal documents could not be loaded. Please try again.");
      setLoading(false);
      return;
    }
    const status = data as Status;
    setDocuments(status.documents || []);
    setAcceptedIds(status.acceptedDocumentIds || []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void loadDocuments();
    return undefined;
  }, [loadDocuments]));

  const allAccepted = documents.length > 0 && documents.every((document) => acceptedIds.includes(document.id));

  return <View style={styles.card}>
    <Text style={styles.title}>Terms & Conditions and Privacy Policy</Text>
    <Text style={styles.copy}>These are the current documents published by your CB Nest administrator. Your agreement status is shown against each current version.</Text>
    {loading ? <ActivityIndicator color="#D9A93F"/> : error ? <View style={styles.messageBlock}>
      <Text style={styles.error}>{error}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => void loadDocuments()} style={styles.retry}><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
    </View> : documents.length ? <>
      {allAccepted && <View style={styles.acceptedBanner}><Text style={styles.acceptedBannerText}>✓  You have agreed to all current legal documents</Text></View>}
      {documents.map((document) => {
        const agreed = acceptedIds.includes(document.id);
        return <View key={document.id} style={styles.document}>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: expanded === document.id }} onPress={() => setExpanded((current) => current === document.id ? null : document.id)} style={styles.heading}>
            <View style={styles.headingCopy}>
              <Text style={styles.documentTitle}>{document.title}</Text>
              <Text style={styles.version}>VERSION {document.version}</Text>
            </View>
            <View style={styles.statusWrap}>
              {agreed
                ? <Text style={styles.agreed}>✓ AGREED</Text>
                : <Text style={styles.pending}>NOT AGREED</Text>}
              <Text style={styles.expand}>{expanded === document.id ? "−" : "+"}</Text>
            </View>
          </TouchableOpacity>
          {expanded === document.id && <ScrollView nestedScrollEnabled style={styles.body}><Text selectable style={styles.bodyText}>{document.content}</Text></ScrollView>}
        </View>;
      })}
    </> : <Text style={styles.copy}>Your CB Nest administrator has not published the current legal documents yet.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card:{marginTop:15,padding:15,borderRadius:14,backgroundColor:"#171717",borderWidth:1,borderColor:"#403622",gap:11},
  title:{fontSize:14,color:"#FFFFFF",fontWeight:"900"},
  copy:{fontSize:11,lineHeight:17,color:"#B9B9B9"},
  acceptedBanner:{padding:10,borderRadius:9,backgroundColor:"rgba(47,179,109,0.12)",borderWidth:1,borderColor:"rgba(47,179,109,0.5)"},
  acceptedBannerText:{fontSize:11,color:"#2FB36D",fontWeight:"900"},
  document:{borderTopWidth:1,borderTopColor:"#38332A",paddingTop:11},
  heading:{flexDirection:"row",alignItems:"center",gap:12},
  headingCopy:{flex:1,gap:4},
  documentTitle:{fontSize:12,color:"#FFFFFF",fontWeight:"800"},
  version:{fontSize:8,color:"#D9A93F",fontWeight:"900",letterSpacing:1},
  statusWrap:{alignItems:"flex-end",gap:5},
  agreed:{fontSize:9,color:"#2FB36D",fontWeight:"900"},
  pending:{fontSize:9,color:"#D9A93F",fontWeight:"900"},
  expand:{fontSize:20,color:"#D9A93F",fontWeight:"700"},
  body:{maxHeight:280,marginTop:10,padding:10,backgroundColor:"#101010",borderRadius:8},
  bodyText:{fontSize:10,lineHeight:17,color:"#E0E0E0"},
  messageBlock:{gap:10},
  error:{fontSize:11,lineHeight:17,color:"#FF9292"},
  retry:{alignSelf:"flex-start",paddingHorizontal:16,paddingVertical:9,borderRadius:8,backgroundColor:"#D9A93F"},
  retryText:{fontSize:11,color:"#17130B",fontWeight:"900"}
});
