import React from 'react';
import { SafeAreaView, Text, FlatList } from 'react-native';

import menu from './menu-sample.json';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#111', padding: 16 }}>
      <Text style={{ color: '#f5c518', fontSize: 24, marginBottom: 16 }}>BOTEQUIM Delivery</Text>
      <FlatList
        data={menu}
        keyExtractor={(item) => item.code}
        renderItem={({ item }) => (
          <Text style={{ color: '#fff', marginBottom: 4 }}>
            {item.name} - R$ {item.price}
          </Text>
        )}
      />
    </SafeAreaView>
  );
}
