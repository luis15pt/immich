<script lang="ts">
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { alwaysLoadOriginalFile } from '$lib/stores/preferences.store';
  import { getAssetPlaybackUrl, getAssetUrl } from '$lib/utils';
  import type { AssetResponseDto } from '@immich/sdk';
  import { LoadingSpinner } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import { fade } from 'svelte/transition';

  interface Props {
    asset: AssetResponseDto;
  }

  const { asset }: Props = $props();

  const playbackUrl = $derived(getAssetPlaybackUrl({ id: asset.id }));
  const originalUrl = $derived(getAssetUrl({ asset, forceOriginal: true })!);
  const flatVideoUrl = $derived($alwaysLoadOriginalFile ? originalUrl : playbackUrl);

  const modules = Promise.all([
    import('./PhotoSphereViewerAdapter.svelte').then((module) => module.default),
    import('@photo-sphere-viewer/equirectangular-video-adapter').then((module) => module.EquirectangularVideoAdapter),
    import('@photo-sphere-viewer/video-plugin').then((module) => module.VideoPlugin),
    import('@photo-sphere-viewer/video-plugin/index.css'),
  ]);
</script>

<div transition:fade={{ duration: 150 }} class="flex h-full w-full select-none place-content-center place-items-center">
  {#if assetViewerManager.isPanoramaFlatView}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video class="h-full w-full object-contain" src={flatVideoUrl} controls autoplay loop></video>
  {:else}
    {#await modules}
      <LoadingSpinner />
    {:then [PhotoSphereViewer, adapter, videoPlugin]}
      <PhotoSphereViewer
        panorama={{ source: playbackUrl }}
        originalPanorama={{ source: originalUrl }}
        plugins={[videoPlugin]}
        {adapter}
        navbar
      />
    {:catch}
      {$t('errors.failed_to_load_asset')}
    {/await}
  {/if}
</div>
