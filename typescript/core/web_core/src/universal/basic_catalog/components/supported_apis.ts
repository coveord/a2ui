/*
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Per-component API definitions that the universal basic catalog elements are
 * typed against. Each element takes its type as a type parameter, so its props
 * are inferred from the v0.9 schema.
 *
 * The v1 basic catalog in `@a2ui/catalog-basic` pairs the same elements with
 * its own APIs. The few props that only v1 defines, such as `Slider.steps`, are
 * read behind an `in` check.
 */

import type * as v0_9 from '../../../v0_9/basic_catalog/components/basic_components.js';

export type AudioPlayerSupportedApis = typeof v0_9.AudioPlayerApi;
export type ButtonSupportedApis = typeof v0_9.ButtonApi;
export type CardSupportedApis = typeof v0_9.CardApi;
export type CheckBoxSupportedApis = typeof v0_9.CheckBoxApi;
export type ChoicePickerSupportedApis = typeof v0_9.ChoicePickerApi;
export type ColumnSupportedApis = typeof v0_9.ColumnApi;
export type DateTimeInputSupportedApis = typeof v0_9.DateTimeInputApi;
export type DividerSupportedApis = typeof v0_9.DividerApi;
export type IconSupportedApis = typeof v0_9.IconApi;
export type ImageSupportedApis = typeof v0_9.ImageApi;
export type ListSupportedApis = typeof v0_9.ListApi;
export type ModalSupportedApis = typeof v0_9.ModalApi;
export type RowSupportedApis = typeof v0_9.RowApi;
export type SliderSupportedApis = typeof v0_9.SliderApi;
export type TabsSupportedApis = typeof v0_9.TabsApi;
export type TextSupportedApis = typeof v0_9.TextApi;
export type TextFieldSupportedApis = typeof v0_9.TextFieldApi;
export type VideoSupportedApis = typeof v0_9.VideoApi;
