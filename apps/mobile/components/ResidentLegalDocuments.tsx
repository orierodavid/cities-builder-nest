import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { supabase } from "../lib/supabase";

type Document = { id: string; title: string; version: string; documentType: string; content: string };
type Status = { documents: Document[]; configurationRequired: boolean };

export default function ResidentLegalDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    supabase.rpc("get_legal_consent_status").then(({ data, error: loadError }) => {
      if (!alive) return;
      if (loadError || !data) setError("Legal documents could not be loaded.");
      else setDocuments(((data as Status).documents || []) as Document[]);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return <View style={styles.card}>
    <Text style={styles.title}>Legal documents</Text>
    <Text style={styles.copy}>Review the current Terms and Conditions and Privacy Policy at any time.</Text>
    {loading ? <ActivityIndicator color="#D4A84B"/> : error ? <Text style={styles.copy}>{error}</Text> : documents.length ? documents.map((document) => <View key={document.id} style={styles.document}>
      <TouchableOpacity onPress={() => setExpanded((current) => current === document.id ? null : document.id)} style={styles.heading}>
        <View style={{flex:1}}><Text style={styles.documentTitle}>{document.title}</Text><Text style={styles.version}>VERSION {document.version}</Text></View>
        <Text style={styles.expand}>{expanded === document.id ? "−" : "+"}</Text>
      </TouchableOpacity>
      {expanded === document.id && <ScrollView nestedScrollEnabled style={styles.body}><Text selectable style={styles.bodyText}>{document.content}</Text></ScrollView>}
    </View>) : <Text style={styles.copy}>Current legal documents have not been published yet.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card:{marginTop:15,padding:15,borderRadius:14,backgroundColor:"#171717",borderWidth:1,borderColor:"#403622",gap:9},
  title:{fontSize:14,color:"#FFFFFF",fontWeight:"900"},
  copy:{fontSize:11,lineHeight:17,color:"#B9B9B9"},
  document:{borderTopWidth:1,borderTopColor:"#38332A",paddingTop:10},
  heading:{flexDirection:"row",alignItems:"center",gap:12},
  documentTitle:{fontSize:12,color:"#FFFFFF",fontWeight:"800"},
  version:{fontSize:8,color:"#D4A84B",fontWeight:"900",letterSpacing:1,marginTop:4},
  expand:{fontSize:20,color:"#D4A84B",fontWeight:"700"},
  body:{maxHeight:240,marginTop:10,padding:10,backgroundColor:"#101010",borderRadius:8},
  bodyText:{fontSize:10,lineHeight:17,color:"#E0E0E0"}
});
