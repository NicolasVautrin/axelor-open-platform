/*
 * Axelor Business Solutions
 *
 * Copyright (C) 2005-2025 Axelor (<http://axelor.com>).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
package com.axelor.gradle.tasks;

import com.axelor.gradle.AxelorUtils;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.gradle.api.DefaultTask;
import org.gradle.api.Project;
import org.gradle.api.artifacts.ResolvedArtifact;
import org.gradle.api.file.DuplicatesStrategy;
import org.gradle.api.file.FileTree;
import org.gradle.api.tasks.InputFiles;
import org.gradle.api.tasks.OutputDirectory;
import org.gradle.api.tasks.TaskAction;
import org.gradle.api.tasks.util.PatternSet;

public class CopyWebapp extends DefaultTask {

  private PatternSet pattern = new PatternSet().include("webapp/**/*");

  @OutputDirectory
  public File getOutputDir() {
    return new File(getProject().getLayout().getBuildDirectory().get().getAsFile(), "webapp");
  }

  @InputFiles
  public List<FileTree> getFrontFiles() {
    List<FileTree> files = new ArrayList<>();
    AxelorUtils.findAxelorArtifacts(getProject()).stream()
        .filter(it -> "axelor-web".equals(it.getName()))
        .forEach(
            artifact -> {
              Project module = AxelorUtils.findProject(getProject(), artifact);
              if (module != null) {
                files.add(module.fileTree("../axelor-front/dist"));
              }
            });
    return files;
  }

  @InputFiles
  public List<FileTree> getFiles() {
    List<FileTree> files = new ArrayList<>();

    // first include module webapp resources
    AxelorUtils.findAxelorArtifacts(getProject()).stream().map(this::webapp).forEach(files::add);

    // than include own webapp resources
    files.add(getProject().fileTree("src/main").matching(pattern));

    return files;
  }

  private FileTree webapp(ResolvedArtifact artifact) {
    Project module = AxelorUtils.findProject(getProject(), artifact);
    return module == null
        ? getProject().zipTree(artifact.getFile()).matching(pattern)
        : module.fileTree("src/main").matching(pattern);
  }

  @TaskAction
  public void copy() throws IOException {
    Project project = getProject();
    project.copy(
        task -> {
          task.setDuplicatesStrategy(DuplicatesStrategy.INCLUDE);
          task.into(project.getLayout().getBuildDirectory());
          task.from(getFiles());
          task.into(
              project.getLayout().getBuildDirectory().dir("/webapp").get().getAsFile(),
              copySpec -> {
                copySpec.from(getFrontFiles());
                copySpec.setDuplicatesStrategy(DuplicatesStrategy.EXCLUDE);
              });
        });

    // Merge index.html fragments
    mergeIndexHtmlFragments();
  }

  /**
   * Merges HTML fragments into index.html.
   *
   * <p>Looks for fragment files in src/main/webapp/:
   * <ul>
   *   <li>index-head.html - injected at &lt;!-- @AXELOR:HEAD@ --&gt;</li>
   *   <li>index-body-start.html - injected at &lt;!-- @AXELOR:BODY_START@ --&gt;</li>
   *   <li>index-body-end.html - injected at &lt;!-- @AXELOR:BODY_END@ --&gt;</li>
   * </ul>
   */
  private void mergeIndexHtmlFragments() throws IOException {
    Project project = getProject();
    Path indexHtml = project.getLayout().getBuildDirectory()
        .dir("webapp").get().getAsFile().toPath().resolve("index.html");

    if (!Files.exists(indexHtml)) {
      return;
    }

    String content = Files.readString(indexHtml, StandardCharsets.UTF_8);
    boolean modified = false;

    // Process each fragment type
    String[][] fragments = {
        {"index-head.html", "<!-- @AXELOR:HEAD@ -->"},
        {"index-body-start.html", "<!-- @AXELOR:BODY_START@ -->"},
        {"index-body-end.html", "<!-- @AXELOR:BODY_END@ -->"}
    };

    for (String[] fragment : fragments) {
      String fragmentName = fragment[0];
      String placeholder = fragment[1];

      Path fragmentPath = project.file("src/main/webapp/" + fragmentName).toPath();
      if (Files.exists(fragmentPath)) {
        String fragmentContent = Files.readString(fragmentPath, StandardCharsets.UTF_8);
        if (content.contains(placeholder)) {
          content = content.replace(placeholder, fragmentContent + "\n    " + placeholder);
          modified = true;
          getLogger().lifecycle("Injected {} into index.html", fragmentName);
        }
      }
    }

    if (modified) {
      Files.writeString(indexHtml, content, StandardCharsets.UTF_8);
    }
  }
}
