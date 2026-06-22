import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useRef } from 'react';
import { Dimensions, FlatList, StyleSheet, View, type ViewToken } from 'react-native';

import { AppText, Button, Screen } from '@/shared/ui';

import { type FeedPost } from '../model/post';
import { useFeed } from '../use-feed';

const { height } = Dimensions.get('window');

function FeedItem({
  post,
  active,
  onLike,
}: {
  post: FeedPost;
  active: boolean;
  onLike: () => void;
}) {
  const player = useVideoPlayer(post.video_url, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return (
    <View style={{ height }} className="justify-end bg-ink">
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
      <View className="gap-2 p-5">
        {post.caption ? (
          <AppText variant="body" className="text-ink-inverse">
            {post.caption}
          </AppText>
        ) : null}
        <Button
          testID={`feed-like-${post.id}`}
          variant="ghost"
          label={`${post.likedByMe ? '♥' : '♡'} ${post.likeCount}`}
          onPress={onLike}
        />
      </View>
    </View>
  );
}

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder reels feed
 * — vertical paging, autoplay-on-visible, optimistic likes. The logic lives in `useFeed`.
 */
export function FeedScreen() {
  const { posts, loading, activeIndex, setActiveIndex, loadMore, like } = useFeed();

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActiveIndex(first.index);
  }).current;

  if (loading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <AppText>Loading…</AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={height}
        decelerationRate="fast"
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        renderItem={({ item, index }) => (
          <FeedItem post={item} active={index === activeIndex} onLike={() => void like(item.id)} />
        )}
      />
    </Screen>
  );
}
