/**
 * TVFocusableRow — Netflix-style horizontal row with proper
 * Android TV focus management, scroll-to-focus, and focus memory.
 */
import React, { useRef, useCallback } from "react";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
} from "react-native";
import { COLORS } from "@/constants/colors";
import { isTV } from "@/lib/platform";
import { saveFocusIndex, getFocusIndex, setSidebarExpanded } from "@/lib/tv-focus-engine";

interface Props {
  rowKey: string;
  title?: string;
  data: any[];
  renderItem: (item: any, index: number) => React.ReactElement;
  keyExtractor?: (item: any) => string;
  onSeeAll?: () => void;
  itemWidth?: number;
}

export const TVFocusableRow = React.memo(function TVFocusableRow({
  rowKey,
  title,
  data,
  renderItem,
  keyExtractor,
  onSeeAll,
  itemWidth = 244,
}: Props) {
  const flatListRef = useRef<FlatList>(null);

  const handleItemFocus = useCallback(
    (index: number) => {
      saveFocusIndex(rowKey, index);
      // Collapse sidebar when user focuses content
      setSidebarExpanded(false);
      // Scroll to keep focused item centered
      flatListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.3,
      });
    },
    [rowKey]
  );

  const handleRowFocus = useCallback(() => {
    // When the row itself gets focus (e.g. via D-pad down), scroll to remembered position
    const idx = getFocusIndex(rowKey);
    if (idx > 0) {
      flatListRef.current?.scrollToIndex({
        index: Math.min(idx, data.length - 1),
        animated: true,
        viewPosition: 0.3,
      });
    }
  }, [rowKey, data.length]);

  if (!isTV) {
    // Mobile: render children directly, no focus management needed
    return null;
  }

  return (
    <View style={styles.container} onFocus={handleRowFocus}>
      {title && (
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          {onSeeAll && (
            <Text style={styles.seeAll}>See All</Text>
          )}
        </View>
      )}
      <FlatList
        ref={flatListRef}
        data={data}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={keyExtractor || ((item) => item.id)}
        renderItem={({ item, index }) => (
          <View
            onFocus={() => handleItemFocus(index)}
          >
            {renderItem(item, index)}
          </View>
        )}
        contentContainerStyle={styles.listContent}
        initialNumToRender={6}
        maxToRenderPerBatch={5}
        windowSize={7}
        removeClippedSubviews
        getItemLayout={(_data, index) => ({
          length: itemWidth,
          offset: itemWidth * index,
          index,
        })}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true,
          });
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 40,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 28,
    marginBottom: 18,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: COLORS.text,
  },
  seeAll: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.accent,
  },
  listContent: {
    paddingHorizontal: 28,
  },
});
